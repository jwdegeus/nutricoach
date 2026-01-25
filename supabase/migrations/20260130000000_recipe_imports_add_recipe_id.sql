-- Migration: Add recipe_id to recipe_imports
-- Created: 2026-01-30
-- Description: Voeg recipe_id veld toe aan recipe_imports om de finalize relatie op te slaan

-- ============================================================================
-- Add recipe_id column to recipe_imports
-- ============================================================================

ALTER TABLE public.recipe_imports
  ADD COLUMN IF NOT EXISTS recipe_id UUID NULL REFERENCES public.custom_meals(id) ON DELETE SET NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_recipe_imports_recipe_id ON public.recipe_imports(recipe_id);
