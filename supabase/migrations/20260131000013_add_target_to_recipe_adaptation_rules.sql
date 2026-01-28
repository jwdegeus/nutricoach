-- Migration: Add target and match_mode to recipe_adaptation_rules
-- Created: 2026-01-31
-- Description: Voegt target en match_mode kolommen toe aan recipe_adaptation_rules om te ondersteunen
--              dat regels kunnen matchen op ingredient, step, of metadata targets

-- ============================================================================
-- Add target and match_mode columns to recipe_adaptation_rules
-- ============================================================================

ALTER TABLE public.recipe_adaptation_rules
  ADD COLUMN IF NOT EXISTS target TEXT NOT NULL DEFAULT 'ingredient' CHECK (target IN ('ingredient', 'step', 'metadata')),
  ADD COLUMN IF NOT EXISTS match_mode TEXT NOT NULL DEFAULT 'word_boundary' CHECK (match_mode IN ('exact', 'word_boundary', 'substring', 'canonical_id'));

-- Create index on target for faster queries
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_rules_target ON public.recipe_adaptation_rules(target);

-- Create index on match_mode for faster queries
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_rules_match_mode ON public.recipe_adaptation_rules(match_mode);

-- Update existing rows to have default values (they're already set via DEFAULT, but this ensures consistency)
UPDATE public.recipe_adaptation_rules
SET 
  target = 'ingredient',
  match_mode = 'word_boundary'
WHERE target IS NULL OR match_mode IS NULL;
