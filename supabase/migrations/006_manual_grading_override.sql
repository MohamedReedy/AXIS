-- 006_manual_grading_override.sql
-- Human-in-the-loop manual grading override for subjective (short answer) and other questions.
-- Allows administrators to award or withdraw points after student submission, automatically recalculating
-- attempt total_score and percentage.

CREATE OR REPLACE FUNCTION public.admin_override_grade(
    p_attempt_id UUID,
    p_question_id UUID,
    p_points_earned NUMERIC,
    p_is_correct BOOLEAN DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_attempt RECORD;
    v_question RECORD;
    v_new_total NUMERIC(6, 2) := 0.00;
    v_max_possible NUMERIC(6, 2) := 0.00;
    v_new_percentage NUMERIC(5, 2) := 0.00;
    v_is_correct_final BOOLEAN;
    v_clamped_points NUMERIC(6, 2);
BEGIN
    -- 1. Authorization: Only admins can override grades
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Only administrators can adjust grades.';
    END IF;

    -- 2. Verify Attempt exists
    SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = p_attempt_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attempt not found';
    END IF;

    -- 3. Verify Question exists and belongs to this exam
    SELECT * INTO v_question FROM public.questions WHERE id = p_question_id AND exam_id = v_attempt.exam_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Question not found for this exam';
    END IF;

    -- Clamp points between 0 and question maximum points
    v_clamped_points := GREATEST(0.00, LEAST(p_points_earned, v_question.points));

    -- Determine is_correct status
    IF p_is_correct IS NOT NULL THEN
        v_is_correct_final := p_is_correct;
    ELSE
        v_is_correct_final := (v_clamped_points > 0.00);
    END IF;

    -- 4. Upsert into answers table
    INSERT INTO public.answers (
        attempt_id,
        question_id,
        is_correct,
        points_earned,
        updated_at
    ) VALUES (
        p_attempt_id,
        p_question_id,
        v_is_correct_final,
        v_clamped_points,
        now()
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE SET
        is_correct = EXCLUDED.is_correct,
        points_earned = EXCLUDED.points_earned,
        updated_at = now();

    -- 5. Recalculate Attempt total_score and percentage
    SELECT 
        COALESCE(SUM(ans.points_earned), 0.00),
        COALESCE(SUM(q.points), 0.00)
    INTO v_new_total, v_max_possible
    FROM public.questions q
    LEFT JOIN public.answers ans ON ans.question_id = q.id AND ans.attempt_id = p_attempt_id
    WHERE q.exam_id = v_attempt.exam_id;

    IF v_max_possible > 0 THEN
        v_new_percentage := ROUND((v_new_total / v_max_possible) * 100.0, 2);
    ELSE
        v_new_percentage := 100.00;
    END IF;

    -- 6. Update the attempt with newly calculated score
    UPDATE public.exam_attempts
    SET total_score = v_new_total,
        max_possible_score = v_max_possible,
        percentage = v_new_percentage
    WHERE id = p_attempt_id;

    RETURN jsonb_build_object(
        'success', true,
        'attempt_id', p_attempt_id,
        'question_id', p_question_id,
        'points_earned', v_clamped_points,
        'is_correct', v_is_correct_final,
        'total_score', v_new_total,
        'max_possible_score', v_max_possible,
        'percentage', v_new_percentage
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
