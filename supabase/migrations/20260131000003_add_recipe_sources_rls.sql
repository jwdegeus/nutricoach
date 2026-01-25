-- Migration: Add RLS policies for recipe_sources
-- Created: 2026-01-31
-- Description: RLS policies voor recipe_sources - admins kunnen alles, users kunnen alleen lezen

-- ============================================================================
-- Row Level Security (RLS) Policies for recipe_sources
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view recipe sources" ON public.recipe_sources;
DROP POLICY IF EXISTS "Users can insert own recipe sources" ON public.recipe_sources;
DROP POLICY IF EXISTS "Admins can update recipe sources" ON public.recipe_sources;
DROP POLICY IF EXISTS "Admins can delete recipe sources" ON public.recipe_sources;

-- Anyone can view sources (for dropdowns, etc.)
CREATE POLICY "Anyone can view recipe sources"
  ON public.recipe_sources
  FOR SELECT
  USING (true);

-- Users can insert their own sources
CREATE POLICY "Users can insert own recipe sources"
  ON public.recipe_sources
  FOR INSERT
  WITH CHECK (
    created_by_user_id = auth.uid() OR
    public.is_admin(auth.uid())
  );

-- Only admins can update sources
CREATE POLICY "Admins can update recipe sources"
  ON public.recipe_sources
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can delete sources
CREATE POLICY "Admins can delete recipe sources"
  ON public.recipe_sources
  FOR DELETE
  USING (public.is_admin(auth.uid()));
