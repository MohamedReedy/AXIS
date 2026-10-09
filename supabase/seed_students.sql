-- supabase/seed_students.sql
-- Example script to seed initial students into the platform

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to seed a student
DO $$
DECLARE
    v_student_1 UUID := gen_random_uuid();
    v_student_2 UUID := gen_random_uuid();
BEGIN
    -- 1. Student 1: ahmed@example.com / Student123!
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'ahmed@example.com') THEN
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
            v_student_1,
            '00000000-0000-0000-0000-000000000000',
            'ahmed@example.com',
            crypt('Student123!', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Ahmed Mohamed","role":"student","student_id":"STU-1001"}'::jsonb,
            now(),
            now(),
            'authenticated',
            'authenticated'
        );

        INSERT INTO public.profiles (id, full_name, email, role, student_id)
        VALUES (v_student_1, 'Ahmed Mohamed', 'ahmed@example.com', 'student', 'STU-1001')
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- 2. Student 2: sara@example.com / Student123!
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'sara@example.com') THEN
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
            v_student_2,
            '00000000-0000-0000-0000-000000000000',
            'sara@example.com',
            crypt('Student123!', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Sara Ali","role":"student","student_id":"STU-1002"}'::jsonb,
            now(),
            now(),
            'authenticated',
            'authenticated'
        );

        INSERT INTO public.profiles (id, full_name, email, role, student_id)
        VALUES (v_student_2, 'Sara Ali', 'sara@example.com', 'student', 'STU-1002')
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;
