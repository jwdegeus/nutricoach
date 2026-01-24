-- Migration: Helper script to set a user as admin
-- Created: 2025-01-25
-- Description: Helper function and example to set a user as admin
-- 
-- Usage (replace USER_EMAIL with the actual user email):
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'admin'
-- FROM auth.users
-- WHERE email = 'USER_EMAIL'
-- ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- Example: Set first user as admin (for development/testing)
-- Uncomment and modify as needed:
/*
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  -- Get the first user (or modify to get by email)
  SELECT id INTO first_user_id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  -- Set as admin if user exists
  IF first_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (first_user_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
  END IF;
END $$;
*/
