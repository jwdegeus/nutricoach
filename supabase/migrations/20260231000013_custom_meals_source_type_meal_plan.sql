-- Description: Allow source_type 'meal_plan' on custom_meals so users can save a meal plan meal to the recipes database.

ALTER TABLE public.custom_meals
  DROP CONSTRAINT IF EXISTS custom_meals_source_type_check;

ALTER TABLE public.custom_meals
  ADD CONSTRAINT custom_meals_source_type_check
  CHECK (source_type IN ('photo', 'screenshot', 'file', 'gemini', 'meal_plan'));

COMMENT ON COLUMN public.custom_meals.source_type IS 'How meal was added: photo, screenshot, file, gemini (import/AI), or meal_plan (saved from meal plan)';
