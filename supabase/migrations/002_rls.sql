-- 002_rls.sql: Row Level Security policies

-- Enable RLS on all public tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Profiles Policies
CREATE POLICY "Users can read their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND role = 'student'); -- Students cannot elevate themselves to admin

CREATE POLICY "Admins can manage all profiles"
    ON public.profiles FOR ALL
    USING (public.is_admin());

-- 2. Exams Policies
CREATE POLICY "Admins can manage all exams"
    ON public.exams FOR ALL
    USING (public.is_admin() OR auth.uid() = created_by);

CREATE POLICY "Anyone can view published exams"
    ON public.exams FOR SELECT
    USING (status = 'published');

-- 3. Questions Policies
CREATE POLICY "Admins can manage questions"
    ON public.questions FOR ALL
    USING (
        public.is_admin() OR 
        EXISTS (SELECT 1 FROM public.exams WHERE id = questions.exam_id AND created_by = auth.uid())
    );

CREATE POLICY "Anyone can view questions for published exams"
    ON public.questions FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.exams WHERE id = questions.exam_id AND status = 'published')
    );

-- 4. Question Choices Policies
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

-- Secure student view: NEVER exposes is_correct to the student client
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

-- 5. Exam Attempts Policies
CREATE POLICY "Admins can view attempts for their exams"
    ON public.exam_attempts FOR SELECT
    USING (
        public.is_admin() OR 
        EXISTS (SELECT 1 FROM public.exams WHERE id = exam_attempts.exam_id AND created_by = auth.uid())
    );

CREATE POLICY "Students can view their own attempts"
    ON public.exam_attempts FOR SELECT
    USING (
        auth.uid() = student_id OR
        (auth.uid() IS NULL AND student_email = current_setting('request.jwt.claim.email', true))
    );

-- 6. Answers Policies
CREATE POLICY "Admins can view all answers"
    ON public.answers FOR SELECT
    USING (
        public.is_admin() OR 
        EXISTS (
            SELECT 1 FROM public.exam_attempts a
            JOIN public.exams e ON e.id = a.exam_id
            WHERE a.id = answers.attempt_id AND e.created_by = auth.uid()
        )
    );

CREATE POLICY "Students can view and save their own answers"
    ON public.answers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.exam_attempts a
            WHERE a.id = answers.attempt_id AND (a.student_id = auth.uid() OR auth.uid() IS NULL)
        )
    );

-- 7. Violations Policies
CREATE POLICY "Admins can view violations"
    ON public.violations FOR SELECT
    USING (
        public.is_admin() OR 
        EXISTS (
            SELECT 1 FROM public.exam_attempts a
            JOIN public.exams e ON e.id = a.exam_id
            WHERE a.id = violations.attempt_id AND e.created_by = auth.uid()
        )
    );

CREATE POLICY "Students can view violations for their attempt"
    ON public.violations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.exam_attempts a
            WHERE a.id = violations.attempt_id AND (a.student_id = auth.uid() OR auth.uid() IS NULL)
        )
    );
