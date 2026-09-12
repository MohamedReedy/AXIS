-- ====================================================================
-- SEEDER: DEFAULT ADMINISTRATOR ACCOUNT
-- ====================================================================
-- Email:    mohamedreedy@axis.learning
-- Password: 502439937
-- Role:     admin
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
    v_user_id UUID := '7620daaf-feca-4fa7-a4ff-21ea6181ccbf';
    v_email TEXT := 'mohamedreedy@axis.learning';
    v_password TEXT := '502439937';
    v_name TEXT := 'Mohamed Reedy';
BEGIN
    -- 1. Insert into auth.users if not present
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            v_email,
            crypt(v_password, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('full_name', v_name, 'role', 'admin'),
            now(),
            now()
        );

        -- Insert into auth.identities
        INSERT INTO auth.identities (
            id,
            user_id,
            provider_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            v_user_id,
            v_user_id,
            v_email,
            format('{"sub":"%s","email":"%s"}', v_user_id, v_email)::jsonb,
            'email',
            now(),
            now(),
            now()
        );
    END IF;

    -- 2. Insert or update public.profiles with role = 'admin'
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        role,
        updated_at
    ) VALUES (
        v_user_id,
        v_name,
        v_email,
        'admin',
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'admin',
        full_name = v_name,
        updated_at = now();

END $$;
