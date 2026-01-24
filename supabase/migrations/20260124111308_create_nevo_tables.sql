-- Migration: Create missing NEVO tables
-- Created: 2026-01-24
-- Description: Aanmaken van ontbrekende NEVO tabellen (recipe_ingredients, nutrients, references)

-- ============================================================================
-- Table: nevo_recipe_ingredients
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nevo_recipe_ingredients (
  id SERIAL PRIMARY KEY,
  nevo_version TEXT NOT NULL,
  recipe_nevo_code INTEGER NOT NULL,
  recipe_name_nl TEXT,
  recipe_name_en TEXT,
  ingredient_nevo_code INTEGER NOT NULL,
  ingredient_name_nl TEXT,
  ingredient_name_en TEXT,
  relative_amount NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_code ON public.nevo_recipe_ingredients(recipe_nevo_code);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient_code ON public.nevo_recipe_ingredients(ingredient_nevo_code);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_ingredient ON public.nevo_recipe_ingredients(recipe_nevo_code, ingredient_nevo_code);

-- ============================================================================
-- Table: nevo_nutrients
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nevo_nutrients (
  id SERIAL PRIMARY KEY,
  nutrient_group_nl TEXT NOT NULL,
  nutrient_group_en TEXT NOT NULL,
  nutrient_code TEXT NOT NULL UNIQUE,
  nutrient_name_nl TEXT NOT NULL,
  nutrient_name_en TEXT NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nevo_nutrients_code ON public.nevo_nutrients(nutrient_code);
CREATE INDEX IF NOT EXISTS idx_nevo_nutrients_group_nl ON public.nevo_nutrients(nutrient_group_nl);
CREATE INDEX IF NOT EXISTS idx_nevo_nutrients_group_en ON public.nevo_nutrients(nutrient_group_en);

-- ============================================================================
-- Table: nevo_references
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nevo_references (
  id SERIAL PRIMARY KEY,
  source_code TEXT NOT NULL UNIQUE,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nevo_references_source_code ON public.nevo_references(source_code);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Ensure handle_updated_at function exists
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_nevo_recipe_ingredients
  BEFORE UPDATE ON public.nevo_recipe_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_nevo_nutrients
  BEFORE UPDATE ON public.nevo_nutrients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_nevo_references
  BEFORE UPDATE ON public.nevo_references
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.nevo_recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nevo_nutrients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nevo_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "NEVO recipe ingredients are publicly readable" ON public.nevo_recipe_ingredients;
CREATE POLICY "NEVO recipe ingredients are publicly readable"
  ON public.nevo_recipe_ingredients
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "NEVO nutrients are publicly readable" ON public.nevo_nutrients;
CREATE POLICY "NEVO nutrients are publicly readable"
  ON public.nevo_nutrients
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "NEVO references are publicly readable" ON public.nevo_references;
CREATE POLICY "NEVO references are publicly readable"
  ON public.nevo_references
  FOR SELECT
  USING (true);
