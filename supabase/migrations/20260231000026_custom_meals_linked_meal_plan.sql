-- Description: Koppeling recept (custom_meals) ↔ meal plan zodat wijzigingen in het recept
-- (afbeelding, ingrediënten) zichtbaar zijn wanneer je teruggaat naar het weekmenu.

ALTER TABLE public.custom_meals
  ADD COLUMN IF NOT EXISTS linked_meal_plan_id UUID NULL REFERENCES public.meal_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_meal_plan_meal_id TEXT NULL;

COMMENT ON COLUMN public.custom_meals.linked_meal_plan_id IS 'Weekmenu waar dit recept uit is toegevoegd; wijzigingen (foto, ingrediënten) tonen in het plan.';
COMMENT ON COLUMN public.custom_meals.linked_meal_plan_meal_id IS 'Meal id in het plan (plan_snapshot.days[].meals[].id).';

CREATE INDEX IF NOT EXISTS idx_custom_meals_linked_meal_plan
  ON public.custom_meals(linked_meal_plan_id, linked_meal_plan_meal_id)
  WHERE linked_meal_plan_id IS NOT NULL;
