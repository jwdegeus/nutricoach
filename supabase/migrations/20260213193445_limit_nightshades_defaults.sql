-- Migration: LIMIT Nachtschades – default max per dag/week
-- Description: Voor Nachtschades met diet_logic = 'limit' en lege max_per_day/week:
--   Stel max_per_day = 1 en max_per_week = 5 in, zodat "Beperkt" een duidelijke betekenis
--   heeft voor de gebruiker. Anders is de limiet impliciet 0 (effectief blokkeren).

UPDATE public.diet_category_constraints dcc
SET
  max_per_day = 1,
  max_per_week = 5
FROM public.ingredient_categories ic
WHERE dcc.category_id = ic.id
  AND dcc.diet_logic = 'limit'
  AND dcc.max_per_day IS NULL
  AND dcc.max_per_week IS NULL
  AND ic.code IN ('nightshades', 'nutricoach_nightshades');
