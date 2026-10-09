-- 005_student_management_and_dashboard.sql: Admin student provisioning, Student Dashboard, and Time-Gated Review

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. RPC: Admin Creates New Student
CREATE OR REPLACE FUNCTION public.admin_create_student(
    p_full_name TEXT,
    p_email TEXT,
    p_password TEXT,
    p_student_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := gen_random_uuid();
    v_encrypted_pw TEXT;
    v_clean_email TEXT := lower(trim(p_email));
    v_clean_name TEXT := trim(p_full_name);
BEGIN
    -- Only admin can execute
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Only administrators can add students.';
    END IF;

    -- Validate inputs
    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RAISE EXCEPTION 'Email address is required';
    END IF;

    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RAISE EXCEPTION 'Student full name is required';
    END IF;

    IF p_password IS NULL OR length(p_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters long';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
        RAISE EXCEPTION 'A user with email % already exists', v_clean_email;
    END IF;

    -- Generate bcrypt password hash
    v_encrypted_pw := crypt(p_password, gen_salt('bf'));

    -- Insert into auth.users (Pre-confirmed so student can sign in immediately)
    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        role,
        aud
    ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        v_clean_email,
        v_encrypted_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
            'full_name', v_clean_name,
            'role', 'student',
            'student_id', trim(p_student_id)
        ),
        now(),
        now(),
        'authenticated',
        'authenticated'
    );

    -- Insert or update public.profiles
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        role,
        student_id,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        v_clean_name,
        v_clean_email,
        'student',
        trim(p_student_id),
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = 'student',
        student_id = EXCLUDED.student_id,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'email', v_clean_email,
        'full_name', v_clean_name,
        'student_id', trim(p_student_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RPC: Admin Resets Student Password
CREATE OR REPLACE FUNCTION public.admin_reset_student_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_encrypted_pw TEXT;
    v_user_role TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Only administrators can reset passwords.';
    END IF;

    IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters long';
    END IF;

    -- Ensure we are resetting a student
    SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;
    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Student not found';
    END IF;

    v_encrypted_pw := crypt(p_new_password, gen_salt('bf'));

    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        updated_at = now()
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: Get Student Submitted Exams for Dashboard
CREATE OR REPLACE FUNCTION public.get_student_submitted_exams()
RETURNS JSONB AS $$
DECLARE
    v_student_id UUID := auth.uid();
    v_student_email TEXT := lower(auth.jwt()->>'email');
    v_results JSONB;
BEGIN
    IF v_student_id IS NULL AND v_student_email IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'attempt_id', a.id,
            'exam_id', e.id,
            'exam_title', e.title,
            'exam_description', e.description,
            'exam_start_time', e.start_time,
            'exam_end_time', e.end_time,
            'duration_minutes', e.duration_minutes,
            'started_at', a.started_at,
            'submitted_at', a.submitted_at,
            'status', a.status,
            'strike_count', a.strike_count,
            'total_score', COALESCE(a.total_score, 0),
            'max_possible_score', COALESCE(a.max_possible_score, 0),
            'percentage', COALESCE(a.percentage, 0),
            'is_review_released', (now() >= e.end_time)
        ) ORDER BY a.submitted_at DESC NULLS LAST, a.started_at DESC
    ), '[]'::jsonb) INTO v_results
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE (
        (v_student_id IS NOT NULL AND a.student_id = v_student_id)
        OR (v_student_email IS NOT NULL AND lower(a.student_email) = v_student_email)
    )
    AND a.status IN ('submitted', 'disqualified', 'expired');

    RETURN v_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: Get Student Detailed Exam Review (Strictly Gated by now() >= exam.end_time)
CREATE OR REPLACE FUNCTION public.get_student_exam_review(p_attempt_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_attempt RECORD;
    v_exam RECORD;
    v_is_admin BOOLEAN := public.is_admin();
    v_caller_id UUID := auth.uid();
    v_caller_email TEXT := lower(auth.jwt()->>'email');
    v_questions JSONB;
BEGIN
    -- 1. Fetch Attempt
    SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = p_attempt_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attempt not found';
    END IF;

    -- 2. Validate Ownership (Caller must be student owner or admin)
    IF NOT v_is_admin THEN
        IF v_caller_id IS NOT NULL AND v_attempt.student_id IS NOT NULL AND v_attempt.student_id <> v_caller_id THEN
            IF v_caller_email IS NULL OR lower(v_attempt.student_email) <> v_caller_email THEN
                RAISE EXCEPTION 'Unauthorized to view this attempt review';
            END IF;
        ELSIF v_caller_email IS NOT NULL AND lower(v_attempt.student_email) <> v_caller_email THEN
            RAISE EXCEPTION 'Unauthorized to view this attempt review';
        END IF;
    END IF;

    -- 3. Fetch Exam
    SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam not found';
    END IF;

    -- 4. Strict Time-Gate Enforcement:
    -- If exam end_time has NOT passed yet and caller is NOT admin, block review!
    IF NOT v_is_admin AND now() < v_exam.end_time THEN
        RAISE EXCEPTION 'Exam review is locked until the scheduled exam end time (%) to maintain academic integrity.', v_exam.end_time;
    END IF;

    -- 5. Build Questions & Answers Breakdown
    -- Choices include is_correct because the scheduled exam end time has officially passed
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', q.id,
            'order_index', q.order_index,
            'question_text', q.question_text,
            'question_type', q.question_type,
            'points', q.points,
            'image_url', q.image_url,
            'choices', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', qc.id,
                        'order_index', qc.order_index,
                        'choice_text', qc.choice_text,
                        'is_correct', qc.is_correct
                    ) ORDER BY qc.order_index
                ), '[]'::jsonb)
                FROM public.question_choices qc
                WHERE qc.question_id = q.id
            ),
            'student_answer', (
                SELECT jsonb_build_object(
                    'selected_choice_id', ans.selected_choice_id,
                    'text_answer', ans.text_answer,
                    'is_correct', ans.is_correct,
                    'points_earned', ans.points_earned
                )
                FROM public.answers ans
                WHERE ans.attempt_id = p_attempt_id AND ans.question_id = q.id
                LIMIT 1
            )
        ) ORDER BY q.order_index
    ), '[]'::jsonb) INTO v_questions
    FROM public.questions q
    WHERE q.exam_id = v_exam.id;

    RETURN jsonb_build_object(
        'attempt', jsonb_build_object(
            'id', v_attempt.id,
            'student_name', v_attempt.student_name,
            'student_email', v_attempt.student_email,
            'student_code', v_attempt.student_code,
            'started_at', v_attempt.started_at,
            'submitted_at', v_attempt.submitted_at,
            'status', v_attempt.status,
            'strike_count', v_attempt.strike_count,
            'total_score', COALESCE(v_attempt.total_score, 0),
            'max_possible_score', COALESCE(v_attempt.max_possible_score, 0),
            'percentage', COALESCE(v_attempt.percentage, 0)
        ),
        'exam', jsonb_build_object(
            'id', v_exam.id,
            'title', v_exam.title,
            'description', v_exam.description,
            'instructions', v_exam.instructions,
            'start_time', v_exam.start_time,
            'end_time', v_exam.end_time,
            'duration_minutes', v_exam.duration_minutes
        ),
        'questions', v_questions
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
