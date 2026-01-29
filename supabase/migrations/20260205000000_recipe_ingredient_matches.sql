-- Migration: Recipe ingredient matches (learned mappings)
-- Description: Slaat op welke recept-ingredienttekst naar welk NEVO/custom product
--  wordt gemapt, zodat het systeem slimmer wordt bij "Mogelijk bedoelde u …?"

CREATE TABLE IF NOT EXISTS public.recipe_ingredient_matches (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('nevo', 'custom')),
  nevo_code INTEGER NULL,
  custom_food_id UUID NULL REFERENCES public.custom_foods(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT recipe_ingredient_matches_ref_check
    CHECK (
      (source = 'nevo' AND nevo_code IS NOT NULL AND custom_food_id IS NULL) OR
      (source = 'custom' AND custom_food_id IS NOT NULL AND nevo_code IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_ingredient_matches_normalized
  ON public.recipe_ingredient_matches (normalized_text);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredient_matches_created_at
  ON public.recipe_ingredient_matches (created_at DESC);

ALTER TABLE public.recipe_ingredient_matches ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all matches (global learning)
CREATE POLICY "Authenticated can read recipe ingredient matches"
  ON public.recipe_ingredient_matches
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert new matches (when user confirms a suggestion)
CREATE POLICY "Authenticated can insert recipe ingredient matches"
  ON public.recipe_ingredient_matches
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
