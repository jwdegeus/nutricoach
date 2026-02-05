-- Migration: Allow meal_slot 'other' in meal_history (align with custom_meals)
-- When a user rates a custom recipe with meal_slot 'other', we create a meal_history
-- row; the previous CHECK only allowed breakfast/lunch/dinner/snack.

ALTER TABLE public.meal_history
  DROP CONSTRAINT IF EXISTS meal_history_meal_slot_check;

ALTER TABLE public.meal_history
  ADD CONSTRAINT meal_history_meal_slot_check
  CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack', 'other'));
