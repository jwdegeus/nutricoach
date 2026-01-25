-- Migration: Add source field to custom_meals and meal_history
-- Created: 2026-01-31
-- Description: Voegt een source veld toe voor bron tag (waar recept vandaan komt)

-- Add source column to custom_meals
ALTER TABLE public.custom_meals
  ADD COLUMN IF NOT EXISTS source TEXT NULL;

-- Add source column to meal_history
ALTER TABLE public.meal_history
  ADD COLUMN IF NOT EXISTS source TEXT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.custom_meals.source IS 'Bron van het recept (bijv. "Allrecipes", "BBC Good Food", etc.) - voor filtering';
COMMENT ON COLUMN public.meal_history.source IS 'Bron van het recept (bijv. "Allrecipes", "BBC Good Food", etc.) - voor filtering';
