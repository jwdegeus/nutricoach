-- Migration: Create recipe_sources table
-- Created: 2026-01-31
-- Description: Tabel voor het opslaan van recept bronnen (zowel voorgedefinieerd als door gebruikers toegevoegd)

-- ============================================================================
-- Table: recipe_sources
-- ============================================================================
-- Opslag van recept bronnen (bijv. "Allrecipes", "BBC Good Food", etc.)

CREATE TABLE IF NOT EXISTS public.recipe_sources (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- Source name (e.g., "Allrecipes", "AI gegenereerd")
  is_system BOOLEAN NOT NULL DEFAULT false, -- True for system-defined sources, false for user-added
  created_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL for system sources
  usage_count INTEGER NOT NULL DEFAULT 0, -- How many times this source has been used
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recipe_sources_name ON public.recipe_sources(name);
CREATE INDEX IF NOT EXISTS idx_recipe_sources_is_system ON public.recipe_sources(is_system);
CREATE INDEX IF NOT EXISTS idx_recipe_sources_created_by_user_id ON public.recipe_sources(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_sources_usage_count ON public.recipe_sources(usage_count DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.recipe_sources ENABLE ROW LEVEL SECURITY;

-- Everyone can view sources
CREATE POLICY "Anyone can view recipe sources"
  ON public.recipe_sources
  FOR SELECT
  USING (true);

-- Users can insert their own sources
CREATE POLICY "Users can insert own recipe sources"
  ON public.recipe_sources
  FOR INSERT
  WITH CHECK (auth.uid() = created_by_user_id OR is_system = true);

-- Only system sources can be updated (users can't modify system sources)
-- Users can't update their own sources either (to prevent conflicts)
-- This keeps the data clean

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE TRIGGER set_updated_at_recipe_sources
  BEFORE UPDATE ON public.recipe_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Insert default system sources
-- ============================================================================

INSERT INTO public.recipe_sources (name, is_system, created_by_user_id) VALUES
  ('AI gegenereerd', true, NULL),
  ('Allrecipes', true, NULL),
  ('BBC Good Food', true, NULL),
  ('Jamie Oliver', true, NULL),
  ('Smulweb', true, NULL),
  ('24Kitchen', true, NULL),
  ('Eigen recept', true, NULL),
  ('Kookboek', true, NULL)
ON CONFLICT (name) DO NOTHING;
