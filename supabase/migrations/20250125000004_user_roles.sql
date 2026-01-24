-- Migration: User Roles
-- Created: 2025-01-25
-- Description: User role systeem voor normale gebruikers en admins

-- ============================================================================
-- Table: user_roles
-- ============================================================================
-- Opslag van user roles (normal user vs admin)
-- Standaard is iedereen een 'user', admins krijgen 'admin' role

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index voor user_roles
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- ============================================================================
-- Trigger voor updated_at
-- ============================================================================

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS set_updated_at_user_roles ON public.user_roles;

CREATE TRIGGER set_updated_at_user_roles
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Helper Function: Check if user is admin
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = p_user_id 
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Helper Function: Get user role
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = p_user_id),
    'user'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (they may be recreated in later migrations)
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;

-- Users can view their own role
CREATE POLICY "Users can view own role"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only admins can view all roles (for admin management)
CREATE POLICY "Admins can view all roles"
  ON public.user_roles
  FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Only admins can insert roles
CREATE POLICY "Admins can insert roles"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can update roles
CREATE POLICY "Admins can update roles"
  ON public.user_roles
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- Update RLS Policies for diet_types
-- ============================================================================
-- Allow admins to insert, update, and delete diet_types

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view active diet types" ON public.diet_types;
DROP POLICY IF EXISTS "Admins can insert diet types" ON public.diet_types;
DROP POLICY IF EXISTS "Admins can update diet types" ON public.diet_types;
DROP POLICY IF EXISTS "Admins can delete diet types" ON public.diet_types;

-- Anyone can view active diet types
CREATE POLICY "Anyone can view active diet types"
  ON public.diet_types
  FOR SELECT
  USING (is_active = true);

-- Admins can insert diet types
CREATE POLICY "Admins can insert diet types"
  ON public.diet_types
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

-- Admins can update diet types
CREATE POLICY "Admins can update diet types"
  ON public.diet_types
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Admins can delete diet types (soft delete by setting is_active = false)
CREATE POLICY "Admins can delete diet types"
  ON public.diet_types
  FOR DELETE
  USING (public.is_admin(auth.uid()));
