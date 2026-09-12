-- 004_configurable_attempts.sql
-- Updates the start_exam RPC function to:
-- 1. Parse max_attempts from exam instructions/config tag (<!--CONFIG:{"max_attempts":X}-->)
-- 2. Allow active (in_progress) attempts to be reconnected seamlessly upon browser refresh
-- 3. Enforce server-authoritative attempt limits across all browsers and devices

CREATE OR REPLACE FUNCTION public.start_exam(
    p_exam_id UUID,
    p_student_name TEXT,
    p_student_email TEXT,
    p_student_code TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_exam RECORD;
    v_active_attempt RECORD;
    v_completed_count INT := 0;
    v_max_attempts INT := 1;
    v_now TIMESTAMPTZ := now();
    v_deadline TIMESTAMPTZ;
    v_attempt_id UUID;
    v_config_match TEXT[];
    v_config_json JSONB;
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

    -- Extract max_attempts from instructions tag if present (e.g. <!--CONFIG:{"max_attempts":2}-->)
    IF v_exam.instructions IS NOT NULL THEN
        v_config_match := regexp_matches(v_exam.instructions, '<!--CONFIG:(.*?)-->');
        IF v_config_match IS NOT NULL AND array_length(v_config_match, 1) > 0 THEN
            BEGIN
                v_config_json := v_config_match[1]::JSONB;
                IF v_config_json ? 'max_attempts' THEN
                    v_max_attempts := (v_config_json->>'max_attempts')::INT;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                v_max_attempts := 1;
            END;
        END IF;
    END IF;

    -- Check for an existing active (in_progress) attempt that hasn't expired yet
    SELECT * INTO v_active_attempt 
    FROM public.exam_attempts 
    WHERE exam_id = p_exam_id 
      AND LOWER(student_email) = LOWER(TRIM(p_student_email))
      AND status = 'in_progress'
      AND deadline_at > v_now
    ORDER BY started_at DESC
    LIMIT 1;

    IF FOUND THEN
        -- Return existing active attempt to resume
        RETURN jsonb_build_object(
            'attempt_id', v_active_attempt.id,
            'exam_id', v_exam.id,
            'student_name', v_active_attempt.student_name,
            'student_email', v_active_attempt.student_email,
            'started_at', v_active_attempt.started_at,
            'deadline_at', v_active_attempt.deadline_at,
            'duration_minutes', v_exam.duration_minutes,
            'max_strikes', v_exam.max_strikes,
            'strike_count', v_active_attempt.strike_count,
            'server_now', v_now,
            'is_resumed', true
        );
    END IF;

    -- Check total completed / closed attempts (0 means unlimited)
    IF v_max_attempts > 0 THEN
        SELECT COUNT(*) INTO v_completed_count
        FROM public.exam_attempts
        WHERE exam_id = p_exam_id 
          AND LOWER(student_email) = LOWER(TRIM(p_student_email))
          AND (
            status IN ('submitted', 'disqualified', 'expired') 
            OR (status = 'in_progress' AND deadline_at <= v_now)
          );

        IF v_completed_count >= v_max_attempts THEN
            RAISE EXCEPTION 'Maximum attempts reached (% of %). You have already completed this examination.', v_completed_count, v_max_attempts;
        END IF;
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
        'server_now', v_now,
        'is_resumed', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
