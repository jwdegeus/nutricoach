-- Migration: Terugdraaien van 20260131000028 (Nederlandse synoniemen)
-- Created: 2026-01-31
-- Description: Zet synonyms terug naar de oorspronkelijke waarden uit
--              20260131000012_reset_wahls_paleo_rules, vóór de merge van 20260131000028.
--              Herstelt dieetregels/ingredientengroepen naar de vorige staat.

BEGIN;

DO $$
BEGIN
  -- wahls_forbidden_soy, term 'soy': terug naar oorspronkelijk (zonder de extra sojasaus/tamari/ketjap merge)
  UPDATE public.ingredient_category_items i
  SET synonyms = '["soja", "soy", "soybean", "sojaboon"]'::jsonb, updated_at = NOW()
  FROM public.ingredient_categories c
  WHERE i.category_id = c.id AND c.code = 'wahls_forbidden_soy' AND i.term = 'soy';

  -- wahls_forbidden_dairy, term 'cheese': terug naar oorspronkelijk
  UPDATE public.ingredient_category_items i
  SET synonyms = '["kaas", "cheese", "cheddar", "gouda", "mozzarella", "feta", "brie"]'::jsonb, updated_at = NOW()
  FROM public.ingredient_categories c
  WHERE i.category_id = c.id AND c.code = 'wahls_forbidden_dairy' AND i.term = 'cheese';

  -- wahls_forbidden_added_sugar, term 'sugar': terug naar oorspronkelijk
  UPDATE public.ingredient_category_items i
  SET synonyms = '["suiker", "sugar", "witte suiker", "white sugar", "rietsuiker", "cane sugar", "brown sugar", "bruine suiker"]'::jsonb, updated_at = NOW()
  FROM public.ingredient_categories c
  WHERE i.category_id = c.id AND c.code = 'wahls_forbidden_added_sugar' AND i.term = 'sugar';

  -- wahls_limited_non_gluten_grains, term 'corn': terug naar oorspronkelijk
  UPDATE public.ingredient_category_items i
  SET synonyms = '["mais", "corn", "maize", "cornmeal", "maismeel"]'::jsonb, updated_at = NOW()
  FROM public.ingredient_categories c
  WHERE i.category_id = c.id AND c.code = 'wahls_limited_non_gluten_grains' AND i.term = 'corn';

  RAISE NOTICE 'ingredient_category_items: synonyms teruggezet (revert van 20260131000028)';
END
$$;

COMMIT;
