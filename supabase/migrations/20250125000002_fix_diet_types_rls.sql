-- Migration: Fix diet_types RLS policies to not depend on RPC function
-- Created: 2025-01-25
-- Description: Update RLS policies to check user_roles table directly instead of using RPC

-- ============================================================================
-- Update RLS Policies for diet_types
-- ============================================================================
-- Replace RPC-based checks with direct table queries

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view active diet types" ON public.diet_types;
DROP POLICY IF EXISTS "Admins can insert diet types" ON public.diet_types;
DROP POLICY IF EXISTS "Admins can update diet types" ON public.diet_types;
DROP POLICY IF EXISTS "Admins can delete diet types" ON public.diet_types;

-- Anyone can view active diet types
CREATE POLICY "Anyone can view active diet types"
  ON public.diet_types
  FOR SELECT
  USING (is_active = true);

-- Admins can insert diet types (check user_roles directly)
CREATE POLICY "Admins can insert diet types"
  ON public.diet_types
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM public.user_roles 
      WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
  );

-- Admins can update diet types (check user_roles directly)
CREATE POLICY "Admins can update diet types"
  ON public.diet_types
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

-- Admins can delete diet types (check user_roles directly)
CREATE POLICY "Admins can delete diet types"
  ON public.diet_types
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 
      FROM public.user_roles 
      WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
  );
