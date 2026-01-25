-- Migration: Recipe Ingredients
-- Created: 2026-01-30
-- Description: Tabel voor recipe ingredients (niet-NEVO ingrediënten voor geïmporteerde recepten)

-- ============================================================================
-- Table: recipe_ingredients
-- ============================================================================
-- Opslag van ingrediënten voor geïmporteerde recepten
-- Deze tabel slaat ingrediënten op zonder NEVO mapping (voor toekomstige food matching)

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.custom_meals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Ingredient data from Gemini extraction
  original_line TEXT NOT NULL, -- Original text as it appeared in the image
  quantity NUMERIC(10, 2) NULL, -- Numeric quantity if extractable
  unit TEXT NULL, -- Unit of measurement (e.g., 'g', 'ml', 'cups')
  name TEXT NOT NULL, -- Normalized ingredient name
  note TEXT NULL, -- Optional note or additional information
  
  -- Future: NEVO mapping (out of scope for this step)
  nevo_food_id INTEGER NULL, -- Will be populated when food matching is implemented
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_user_id ON public.recipe_ingredients(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_user ON public.recipe_ingredients(recipe_id, user_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own recipe ingredients
CREATE POLICY "Users can view own recipe ingredients"
  ON public.recipe_ingredients
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert own recipe ingredients
CREATE POLICY "Users can insert own recipe ingredients"
  ON public.recipe_ingredients
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update own recipe ingredients
CREATE POLICY "Users can update own recipe ingredients"
  ON public.recipe_ingredients
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete own recipe ingredients
CREATE POLICY "Users can delete own recipe ingredients"
  ON public.recipe_ingredients
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE TRIGGER set_updated_at_recipe_ingredients
  BEFORE UPDATE ON public.recipe_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
