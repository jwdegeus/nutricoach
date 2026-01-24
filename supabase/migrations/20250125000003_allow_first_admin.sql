-- Migration: Allow first user to set themselves as admin
-- Created: 2025-01-25
-- Description: Fix RLS policies to allow first user to become admin

-- ============================================================================
-- Drop existing policies that prevent first admin creation
-- ============================================================================

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;

-- ============================================================================
-- New policies that allow first admin creation
-- ============================================================================

-- Allow users to insert their own role if no admins exist yet
-- This allows the first user to become admin
CREATE POLICY "Users can insert own role if no admins exist"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (
    -- Must be setting their own role
    auth.uid() = user_id AND (
      -- Allow if no admins exist (first admin creation)
      NOT EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE role = 'admin'
      )
      -- OR user is already admin (can insert other roles)
      OR EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = auth.uid() 
          AND role = 'admin'
      )
    )
  );

-- Allow users to update their own role if no admins exist yet
-- OR if they are already admin
CREATE POLICY "Users can update own role if no admins exist"
  ON public.user_roles
  FOR UPDATE
  USING (
    -- Must be updating their own role
    auth.uid() = user_id AND (
      -- Allow if no admins exist (first admin creation)
      NOT EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE role = 'admin'
      )
      -- OR user is already admin (can update any role)
      OR EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = auth.uid() 
          AND role = 'admin'
      )
    )
  )
  WITH CHECK (
    -- Must be updating their own role
    auth.uid() = user_id AND (
      -- Allow if no admins exist (first admin creation)
      NOT EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE role = 'admin'
      )
      -- OR user is already admin
      OR EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = auth.uid() 
          AND role = 'admin'
      )
    )
  );

-- Admins can still insert/update any role (for managing other users)
CREATE POLICY "Admins can insert any role"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM public.user_roles 
      WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update any role"
  ON public.user_roles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 
      FROM public.user_roles 
      WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM public.user_roles 
      WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
  );
