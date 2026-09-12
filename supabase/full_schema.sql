-- ====================================================================
-- LOCKED EXAM PLATFORM - COMPLETE SUPABASE MIGRATION (RUN IN SQL EDITOR)
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student')),
    student_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-provision Profile on Signup & Automatically assign Admin to the First User
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_count INT;
    v_role TEXT := 'student';
BEGIN
    SELECT COUNT(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin';
    -- The first user to register automatically becomes Admin
    IF v_admin_count = 0 THEN
        v_role := 'admin';
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role, student_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        v_role,
        NEW.raw_user_meta_data->>'student_id'
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email;
        
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Utility function: easily make any user an admin from the Supabase SQL editor
CREATE OR REPLACE FUNCTION public.make_admin(p_email TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET role = 'admin', updated_at = now()
    WHERE LOWER(email) = LOWER(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Exams Table
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    max_strikes INTEGER NOT NULL DEFAULT 3 CHECK (max_strikes > 0),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_exam_dates CHECK (end_time > start_time)
);

-- 4. Questions Table
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 1,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
    points NUMERIC(6, 2) NOT NULL DEFAULT 1.00 CHECK (points >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Question Choices Table (Correct answers protected)
CREATE TABLE IF NOT EXISTS public.question_choices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 1,
    choice_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Exam Attempts Table
CREATE TABLE IF NOT EXISTS public.exam_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    student_name TEXT NOT NULL,
    student_email TEXT NOT NULL,
    student_code TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deadline_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'disqualified', 'expired')),
    strike_count INTEGER NOT NULL DEFAULT 0 CHECK (strike_count >= 0),
    total_score NUMERIC(6, 2) DEFAULT 0.00,
    max_possible_score NUMERIC(6, 2) DEFAULT 0.00,
    percentage NUMERIC(5, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Answers Table
CREATE TABLE IF NOT EXISTS public.answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    selected_choice_id UUID REFERENCES public.question_choices(id) ON DELETE SET NULL,
    text_answer TEXT,
    is_correct BOOLEAN DEFAULT NULL,
    points_earned NUMERIC(6, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_attempt_question UNIQUE (attempt_id, question_id)
);

-- 8. Violations Table
CREATE TABLE IF NOT EXISTS public.violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    violation_type TEXT NOT NULL CHECK (violation_type IN (
        'fullscreen_exit',
        'tab_blur',
        'window_switch',
        'forbidden_shortcut',
        'context_menu',
        'copy_paste'
    )),
    details TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exams_status ON public.exams(status);
CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON public.questions(exam_id, order_index);
CREATE INDEX IF NOT EXISTS idx_choices_question_id ON public.question_choices(question_id, order_index);
CREATE INDEX IF NOT EXISTS idx_attempts_exam_id ON public.exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student_email ON public.exam_attempts(student_email);
CREATE INDEX IF NOT EXISTS idx_answers_attempt_id ON public.answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_violations_attempt_id ON public.violations(attempt_id);

-- Realtime Publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'exam_attempts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_attempts;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'violations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.violations;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'answers'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.answers;
    END IF;
END $$;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

-- Helper function: is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
CREATE POLICY "Users can read their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND role = 'student');

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
    ON public.profiles FOR ALL
    USING (public.is_admin());

-- Exams Policies
DROP POLICY IF EXISTS "Admins can manage all exams" ON public.exams;
CREATE POLICY "Admins can manage all exams"
    ON public.exams FOR ALL
    USING (public.is_admin() OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Anyone can view published exams" ON public.exams;
CREATE POLICY "Anyone can view published exams"
    ON public.exams FOR SELECT
    USING (status = 'published');

-- Questions Policies
DROP POLICY IF EXISTS "Admins can manage questions" ON public.questions;
CREATE POLICY "Admins can manage questions"
    ON public.questions FOR ALL
    USING (
        public.is_admin() OR 
        EXISTS (SELECT 1 FROM public.exams WHERE id = questions.exam_id AND created_by = auth.uid())
    );

DROP POLICY IF EXISTS "Anyone can view questions for published exams" ON public.questions;
CREATE POLICY "Anyone can view questions for published exams"
    ON public.questions FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.exams WHERE id = questions.exam_id AND status = 'published')
    );

-- Question Choices Policies
DROP POLICY IF EXISTS "Admins can manage question choices" ON public.question_choices;
CREATE POLICY "Admins can manage question choices"
    ON public.question_choices FOR ALL
    USING (
        public.is_admin() OR 
        EXISTS (
            SELECT 1 FROM public.questions q
            JOIN public.exams e ON e.id = q.exam_id
            WHERE q.id = question_choices.question_id AND e.created_by = auth.uid()
        )
    );

-- Student Choice View: NEVER exposes is_correct to students
CREATE OR REPLACE VIEW public.student_question_choices AS
SELECT 
    qc.id,
    qc.question_id,
    qc.order_index,
    qc.choice_text
FROM public.question_choices qc
JOIN public.questions q ON q.id = qc.question_id
JOIN public.exams e ON e.id = q.exam_id
WHERE e.status = 'published';

-- Attempts Policies
DROP POLICY IF EXISTS "Admins can view attempts for their exams" ON public.exam_attempts;
CREATE POLICY "Admins can view attempts for their exams"
    ON public.exam_attempts FOR ALL
    USING (
        public.is_admin() OR 
        EXISTS (SELECT 1 FROM public.exams WHERE id = exam_attempts.exam_id AND created_by = auth.uid())
    );

DROP POLICY IF EXISTS "Students can view their own attempts" ON public.exam_attempts;
CREATE POLICY "Students can view their own attempts"
    ON public.exam_attempts FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Students can create attempts for published exams" ON public.exam_attempts;
CREATE POLICY "Students can create attempts for published exams"
    ON public.exam_attempts FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.exams WHERE id = exam_attempts.exam_id AND status = 'published')
    );

DROP POLICY IF EXISTS "Students can update attempts" ON public.exam_attempts;
CREATE POLICY "Students can update attempts"
    ON public.exam_attempts FOR UPDATE
    USING (status IN ('in_progress', 'submitted', 'disqualified'));

-- Answers Policies
DROP POLICY IF EXISTS "Admins can view all answers" ON public.answers;
CREATE POLICY "Admins can view all answers"
    ON public.answers FOR ALL
    USING (
        public.is_admin() OR 
        EXISTS (
            SELECT 1 FROM public.exam_attempts a
            JOIN public.exams e ON e.id = a.exam_id
            WHERE a.id = answers.attempt_id AND e.created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Students can view and save their own answers" ON public.answers;
CREATE POLICY "Students can view and save their own answers"
    ON public.answers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.exam_attempts a
            WHERE a.id = answers.attempt_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.exam_attempts a
            WHERE a.id = answers.attempt_id
        )
    );

-- Violations Policies
DROP POLICY IF EXISTS "Admins can view violations" ON public.violations;
CREATE POLICY "Admins can view violations"
    ON public.violations FOR ALL
    USING (
        public.is_admin() OR 
        EXISTS (
            SELECT 1 FROM public.exam_attempts a
            JOIN public.exams e ON e.id = a.exam_id
            WHERE a.id = violations.attempt_id AND e.created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Students can record violations" ON public.violations;
DROP POLICY IF EXISTS "Students can view violations for their attempt" ON public.violations;
CREATE POLICY "Students can record violations"
    ON public.violations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.exam_attempts a
            WHERE a.id = violations.attempt_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.exam_attempts a
            WHERE a.id = violations.attempt_id
        )
    );

-- ====================================================================
-- RPC FUNCTIONS
-- ====================================================================

-- 1. start_exam
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
    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam not found';
    END IF;

    IF v_exam.status <> 'published' THEN
        RAISE EXCEPTION 'Exam is not currently published (Status: %)', v_exam.status;
    END IF;

    IF v_now < v_exam.start_time THEN
        RAISE EXCEPTION 'Exam has not started yet. Starts at %', v_exam.start_time;
    END IF;

    IF v_now > v_exam.end_time THEN
        RAISE EXCEPTION 'Exam window closed at %', v_exam.end_time;
    END IF;

    SELECT * INTO v_attempt 
    FROM public.exam_attempts 
    WHERE exam_id = p_exam_id AND LOWER(student_email) = LOWER(p_student_email);

    IF FOUND THEN
        IF v_attempt.status IN ('submitted', 'disqualified', 'expired') THEN
            RAISE EXCEPTION 'You have already completed this exam';
        END IF;

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

    v_deadline := LEAST(v_now + (v_exam.duration_minutes || ' minutes')::INTERVAL, v_exam.end_time);

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

-- 2. record_violation
CREATE OR REPLACE FUNCTION public.record_violation(
    p_attempt_id UUID,
    p_violation_type TEXT,
    p_details TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_attempt RECORD;
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

    INSERT INTO public.violations (attempt_id, violation_type, details, timestamp)
    VALUES (p_attempt_id, p_violation_type, p_details, now());

    v_new_strike_count := v_attempt.strike_count + 1;

    IF v_new_strike_count >= v_attempt.max_strikes THEN
        v_is_disqualified := true;
        UPDATE public.exam_attempts
        SET strike_count = v_new_strike_count,
            status = 'disqualified',
            submitted_at = now()
        WHERE id = p_attempt_id;

        -- Automatically grade all answers recorded up to disqualification
        PERFORM public.submit_exam(p_attempt_id);
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

-- 3. save_student_answer
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

    IF v_attempt.status NOT IN ('in_progress') THEN
        RAISE EXCEPTION 'Cannot update answers for completed or locked attempt';
    END IF;

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

-- 4. submit_exam
CREATE OR REPLACE FUNCTION public.submit_exam(p_attempt_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_attempt RECORD;
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

    -- Only return early if already graded
    IF v_attempt.status IN ('submitted', 'disqualified') AND v_attempt.max_possible_score > 0 THEN
        RETURN jsonb_build_object(
            'attempt_id', v_attempt.id,
            'status', v_attempt.status,
            'total_score', v_attempt.total_score,
            'max_possible_score', v_attempt.max_possible_score,
            'percentage', v_attempt.percentage,
            'submitted_at', v_attempt.submitted_at
        );
    END IF;

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
        status = CASE WHEN status = 'disqualified' THEN 'disqualified' ELSE 'submitted' END,
        submitted_at = COALESCE(submitted_at, v_now)
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

-- 5. get_exam_grade_sheet
CREATE OR REPLACE FUNCTION public.get_exam_grade_sheet(p_exam_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_questions JSONB;
    v_students JSONB;
BEGIN
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
