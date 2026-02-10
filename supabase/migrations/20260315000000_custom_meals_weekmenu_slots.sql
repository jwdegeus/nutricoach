-- Description: Weekmenu-classificatie naast soort (meal_slot).
-- Recepten kunnen "voor weekmenu inzetten als" Ontbijt, Lunch en/of Diner, onafhankelijk van soort (Snack, Overig, etc.).
-- NULL = fallback: alleen meal_slot in (breakfast,lunch,dinner) telt dan voor dat slot.

ALTER TABLE public.custom_meals
  ADD COLUMN IF NOT EXISTS weekmenu_slots TEXT[] NULL;

COMMENT ON COLUMN public.custom_meals.weekmenu_slots IS 'Voor weekmenu inzetten als: ontbijt, lunch en/of diner. NULL = fallback op meal_slot (alleen breakfast/lunch/dinner).';

-- Alleen breakfast, lunch, dinner als geldige elementen
ALTER TABLE public.custom_meals
  DROP CONSTRAINT IF EXISTS custom_meals_weekmenu_slots_check;

ALTER TABLE public.custom_meals
  ADD CONSTRAINT custom_meals_weekmenu_slots_check
  CHECK (
    weekmenu_slots IS NULL
    OR (
      array_length(weekmenu_slots, 1) >= 1
      AND weekmenu_slots <@ ARRAY['breakfast', 'lunch', 'dinner']::TEXT[]
    )
  );

-- Backfill: bestaande recepten met meal_slot ontbijt/lunch/diner krijgen dat als weekmenu_slot
UPDATE public.custom_meals
SET weekmenu_slots = ARRAY[meal_slot]::TEXT[]
WHERE meal_slot IN ('breakfast', 'lunch', 'dinner')
  AND (weekmenu_slots IS NULL OR array_length(weekmenu_slots, 1) IS NULL);

CREATE INDEX IF NOT EXISTS idx_custom_meals_weekmenu_slots
  ON public.custom_meals USING GIN (weekmenu_slots)
  WHERE weekmenu_slots IS NOT NULL AND array_length(weekmenu_slots, 1) > 0;
