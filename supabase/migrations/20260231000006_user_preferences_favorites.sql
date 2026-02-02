-- Migration: Add favorite meal IDs to user_preferences
-- Description: Top-10 favorite meal IDs (meal_history.meal_id or custom_meals.id) for reuse bias in meal plan generation.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS favorite_meal_ids TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.user_preferences.favorite_meal_ids IS 'Max 10 favorite meal IDs; enforced in app. Used to boost selection in loadPrefilledBySlot.';
