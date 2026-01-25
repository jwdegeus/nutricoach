-- Migration: Add notes field to custom_meals and meal_history
-- Created: 2026-01-31
-- Description: Voegt een notes veld toe voor gebruikersnotities op recepten

-- Add notes column to custom_meals
ALTER TABLE public.custom_meals
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

-- Add notes column to meal_history
ALTER TABLE public.meal_history
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.custom_meals.notes IS 'User notes for this recipe (rich text/HTML)';
COMMENT ON COLUMN public.meal_history.notes IS 'User notes for this recipe (rich text/HTML)';
