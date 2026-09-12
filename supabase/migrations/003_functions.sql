-- 003_functions.sql: PostgreSQL RPC functions for server-authoritative logic

-- 1. Function: start_exam
CREATE OR REPLACE FUNCTION public.start_exam(
    p_exam_id UUID,
    p_student_name TEXT,
    p_student_email TEXT,
    p_student_code TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_exam RECORD;
    v_attempt RECORD;
    v_now TIMESTAMPTZ := now();
    v_deadline TIMESTAMPTZ;
    v_attempt_id UUID;
BEGIN
    -- Validate exam exists and is published
    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam not found';
    END IF;

    IF v_exam.status <> 'published' THEN
        RAISE EXCEPTION 'Exam is not currently open for submissions (Status: %)', v_exam.status;
    END IF;

    -- Validate schedule server-side
    IF v_now < v_exam.start_time THEN
        RAISE EXCEPTION 'Exam has not started yet. Opens at %', v_exam.start_time;
    END IF;

    IF v_now > v_exam.end_time THEN
        RAISE EXCEPTION 'Exam window closed at %', v_exam.end_time;
    END IF;

    -- Check for existing attempt by email
    SELECT * INTO v_attempt 
    FROM public.exam_attempts 
    WHERE exam_id = p_exam_id AND LOWER(student_email) = LOWER(p_student_email);

    IF FOUND THEN
        IF v_attempt.status IN ('submitted', 'disqualified', 'expired') THEN
            RAISE EXCEPTION 'You have already completed or submitted this exam';
        END IF;

        -- Return existing active attempt
        RETURN jsonb_build_object(
            'attempt_id', v_attempt.id,
            'exam_id', v_exam.id,
            'student_name', v_attempt.student_name,
            'student_email', v_attempt.student_email,
            'started_at', v_attempt.started_at,
            'deadline_at', v_attempt.deadline_at,
            'duration_minutes', v_exam.duration_minutes,
            'max_strikes', v_exam.max_strikes,
            'strike_count', v_attempt.strike_count,
            'server_now', v_now
        );
    END IF;

    -- Compute server deadline: MIN(now + duration, exam.end_time)
    v_deadline := LEAST(v_now + (v_exam.duration_minutes || ' minutes')::INTERVAL, v_exam.end_time);

    -- Insert new attempt
    INSERT INTO public.exam_attempts (
        exam_id,
        student_id,
        student_name,
        student_email,
        student_code,
        started_at,
        deadline_at,
        status,
        strike_count
    ) VALUES (
        p_exam_id,
        auth.uid(),
        TRIM(p_student_name),
        LOWER(TRIM(p_student_email)),
        TRIM(p_student_code),
        v_now,
        v_deadline,
        'in_progress',
        0
    ) RETURNING id INTO v_attempt_id;

    RETURN jsonb_build_object(
        'attempt_id', v_attempt_id,
        'exam_id', v_exam.id,
        'student_name', TRIM(p_student_name),
        'student_email', LOWER(TRIM(p_student_email)),
        'started_at', v_now,
        'deadline_at', v_deadline,
        'duration_minutes', v_exam.duration_minutes,
        'max_strikes', v_exam.max_strikes,
        'strike_count', 0,
        'server_now', v_now
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Function: record_violation
CREATE OR REPLACE FUNCTION public.record_violation(
    p_attempt_id UUID,
    p_violation_type TEXT,
    p_details TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_attempt RECORD;
    v_exam RECORD;
    v_new_strike_count INT;
    v_is_disqualified BOOLEAN := false;
BEGIN
    SELECT a.*, e.max_strikes INTO v_attempt 
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.id = p_attempt_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attempt not found';
    END IF;

    IF v_attempt.status <> 'in_progress' THEN
        RETURN jsonb_build_object(
            'attempt_id', p_attempt_id,
            'strike_count', v_attempt.strike_count,
            'max_strikes', v_attempt.max_strikes,
            'status', v_attempt.status,
            'is_disqualified', (v_attempt.status = 'disqualified')
        );
    END IF;

    -- Insert violation
    INSERT INTO public.violations (attempt_id, violation_type, details, timestamp)
    VALUES (p_attempt_id, p_violation_type, p_details, now());

    -- Increment strikes
    v_new_strike_count := v_attempt.strike_count + 1;

    IF v_new_strike_count >= v_attempt.max_strikes THEN
        v_is_disqualified := true;
        UPDATE public.exam_attempts
        SET strike_count = v_new_strike_count,
            status = 'disqualified',
            submitted_at = now()
        WHERE id = p_attempt_id;
    ELSE
        UPDATE public.exam_attempts
        SET strike_count = v_new_strike_count
        WHERE id = p_attempt_id;
    END IF;

    RETURN jsonb_build_object(
        'attempt_id', p_attempt_id,
        'strike_count', v_new_strike_count,
        'max_strikes', v_attempt.max_strikes,
        'status', CASE WHEN v_is_disqualified THEN 'disqualified' ELSE 'in_progress' END,
        'is_disqualified', v_is_disqualified
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function: save_answer
CREATE OR REPLACE FUNCTION public.save_student_answer(
    p_attempt_id UUID,
    p_question_id UUID,
    p_selected_choice_id UUID DEFAULT NULL,
    p_text_answer TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_attempt RECORD;
BEGIN
    SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = p_attempt_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attempt not found';
    END IF;

    IF v_attempt.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Cannot save answers for completed or locked attempt';
    END IF;

    -- Upsert answer
    INSERT INTO public.answers (attempt_id, question_id, selected_choice_id, text_answer, updated_at)
    VALUES (p_attempt_id, p_question_id, p_selected_choice_id, p_text_answer, now())
    ON CONFLICT (attempt_id, question_id)
    DO UPDATE SET
        selected_choice_id = EXCLUDED.selected_choice_id,
        text_answer = EXCLUDED.text_answer,
        updated_at = now();

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function: submit_exam
CREATE OR REPLACE FUNCTION public.submit_exam(p_attempt_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_attempt RECORD;
    v_exam RECORD;
    v_q RECORD;
    v_correct_choice_id UUID;
    v_correct_text TEXT;
    v_user_answer RECORD;
    v_is_correct BOOLEAN;
    v_points_earned NUMERIC(6, 2);
    v_total_score NUMERIC(6, 2) := 0.00;
    v_max_score NUMERIC(6, 2) := 0.00;
    v_percentage NUMERIC(5, 2) := 0.00;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT a.* INTO v_attempt 
    FROM public.exam_attempts a 
    WHERE a.id = p_attempt_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attempt not found';
    END IF;

    IF v_attempt.status IN ('submitted', 'disqualified') THEN
        RETURN jsonb_build_object(
            'attempt_id', v_attempt.id,
            'status', v_attempt.status,
            'total_score', v_attempt.total_score,
            'max_possible_score', v_attempt.max_possible_score,
            'percentage', v_attempt.percentage,
            'submitted_at', v_attempt.submitted_at
        );
    END IF;

    -- Calculate max score and grade all questions
    FOR v_q IN SELECT * FROM public.questions WHERE exam_id = v_attempt.exam_id ORDER BY order_index LOOP
        v_max_score := v_max_score + v_q.points;
        v_is_correct := false;
        v_points_earned := 0.00;

        SELECT * INTO v_user_answer 
        FROM public.answers 
        WHERE attempt_id = p_attempt_id AND question_id = v_q.id;

        IF FOUND THEN
            IF v_q.question_type IN ('multiple_choice', 'true_false') THEN
                SELECT id INTO v_correct_choice_id 
                FROM public.question_choices 
                WHERE question_id = v_q.id AND is_correct = true 
                LIMIT 1;

                IF v_user_answer.selected_choice_id IS NOT NULL AND v_user_answer.selected_choice_id = v_correct_choice_id THEN
                    v_is_correct := true;
                    v_points_earned := v_q.points;
                END IF;
            ELSIF v_q.question_type = 'short_answer' THEN
                SELECT choice_text INTO v_correct_text
                FROM public.question_choices
                WHERE question_id = v_q.id AND is_correct = true
                LIMIT 1;

                IF v_user_answer.text_answer IS NOT NULL AND 
                   LOWER(TRIM(v_user_answer.text_answer)) = LOWER(TRIM(COALESCE(v_correct_text, ''))) THEN
                    v_is_correct := true;
                    v_points_earned := v_q.points;
                END IF;
            END IF;

            UPDATE public.answers
            SET is_correct = v_is_correct,
                points_earned = v_points_earned
            WHERE attempt_id = p_attempt_id AND question_id = v_q.id;
        ELSE
            -- Record empty answer
            INSERT INTO public.answers (attempt_id, question_id, is_correct, points_earned)
            VALUES (p_attempt_id, v_q.id, false, 0.00)
            ON CONFLICT (attempt_id, question_id) DO NOTHING;
        END IF;

        v_total_score := v_total_score + v_points_earned;
    END LOOP;

    IF v_max_score > 0 THEN
        v_percentage := ROUND((v_total_score / v_max_score) * 100.0, 2);
    ELSE
        v_percentage := 100.00;
    END IF;

    UPDATE public.exam_attempts
    SET total_score = v_total_score,
        max_possible_score = v_max_score,
        percentage = v_percentage,
        status = 'submitted',
        submitted_at = v_now
    WHERE id = p_attempt_id;

    RETURN jsonb_build_object(
        'attempt_id', v_attempt.id,
        'status', 'submitted',
        'total_score', v_total_score,
        'max_possible_score', v_max_score,
        'percentage', v_percentage,
        'submitted_at', v_now
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function: get_exam_grade_sheet
CREATE OR REPLACE FUNCTION public.get_exam_grade_sheet(p_exam_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_questions JSONB;
    v_students JSONB;
BEGIN
    -- Questions metadata
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', q.id,
            'order_index', q.order_index,
            'question_text', q.question_text,
            'question_type', q.question_type,
            'points', q.points
        ) ORDER BY q.order_index
    ) INTO v_questions
    FROM public.questions q
    WHERE q.exam_id = p_exam_id;

    -- Students with answer matrix and violation logs
    SELECT jsonb_agg(
        jsonb_build_object(
            'attempt_id', a.id,
            'student_name', a.student_name,
            'student_email', a.student_email,
            'student_code', a.student_code,
            'started_at', a.started_at,
            'submitted_at', a.submitted_at,
            'status', a.status,
            'strike_count', a.strike_count,
            'total_score', a.total_score,
            'max_possible_score', a.max_possible_score,
            'percentage', a.percentage,
            'answers', COALESCE((
                SELECT jsonb_object_agg(
                    ans.question_id,
                    jsonb_build_object(
                        'selected_choice_id', ans.selected_choice_id,
                        'selected_choice_text', qc.choice_text,
                        'text_answer', ans.text_answer,
                        'is_correct', ans.is_correct,
                        'points_earned', ans.points_earned
                    )
                )
                FROM public.answers ans
                LEFT JOIN public.question_choices qc ON qc.id = ans.selected_choice_id
                WHERE ans.attempt_id = a.id
            ), '{}'::JSONB),
            'violations', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'type', v.violation_type,
                        'details', v.details,
                        'timestamp', v.timestamp
                    ) ORDER BY v.timestamp ASC
                )
                FROM public.violations v
                WHERE v.attempt_id = a.id
            ), '[]'::JSONB)
        ) ORDER BY a.started_at DESC
    ) INTO v_students
    FROM public.exam_attempts a
    WHERE a.exam_id = p_exam_id;

    RETURN jsonb_build_object(
        'questions', COALESCE(v_questions, '[]'::JSONB),
        'students', COALESCE(v_students, '[]'::JSONB)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
