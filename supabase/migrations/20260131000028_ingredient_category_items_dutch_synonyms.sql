-- Migration: Nederlandse synoniemen in ingredientengroepen (bij de bron)
-- Created: 2026-01-31
-- Description: Breidt synonymen uit in ingredient_category_items zodat recept-
--              analyse (o.a. AI Magician) alle gangbare Nederlandse varianten
--              herkent. Hiermee hoeft de diet-validator geen hardcoded synoniemen
--              meer te gebruiken.
-- Idempotent: Gebruikt COALESCE + merge van arrays zodat meerdere runs geen
--              dubbele entries opleveren.

BEGIN;

-- Helper: merge nieuw synoniemen in bestaande array zonder duplicaten
-- Gebruikt jsonb_agg(DISTINCT) over de gecombineerde arrays
DO $$
BEGIN
  -- wahls_forbidden_soy, term 'soy': sojasaus, tamari, ketjap
  UPDATE public.ingredient_category_items i
  SET
    synonyms = (
      SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
      FROM jsonb_array_elements_text(
        COALESCE(i.synonyms, '[]'::jsonb) || '["sojasaus", "tamari", "ketjap"]'::jsonb
      ) AS elem
    ),
    updated_at = NOW()
  FROM public.ingredient_categories c
  WHERE i.category_id = c.id
    AND c.code = 'wahls_forbidden_soy'
    AND i.term = 'soy';

  -- wahls_forbidden_dairy, term 'cheese': geitenkaas, blauwe kaas, parmezaan, camembert, roomkaas, verse mozzarella
  UPDATE public.ingredient_category_items i
  SET
    synonyms = (
      SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
      FROM jsonb_array_elements_text(
        COALESCE(i.synonyms, '[]'::jsonb) || '["geitenkaas", "blauwe kaas", "parmezaan", "camembert", "roomkaas", "verse mozzarella"]'::jsonb
      ) AS elem
    ),
    updated_at = NOW()
  FROM public.ingredient_categories c
  WHERE i.category_id = c.id
    AND c.code = 'wahls_forbidden_dairy'
    AND i.term = 'cheese';

  -- wahls_forbidden_added_sugar, term 'sugar': honing, ahornsiroop, agavesiroop, basterdsuiker, poedersuiker
  UPDATE public.ingredient_category_items i
  SET
    synonyms = (
      SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
      FROM jsonb_array_elements_text(
        COALESCE(i.synonyms, '[]'::jsonb) || '["honing", "ahornsiroop", "agavesiroop", "basterdsuiker", "poedersuiker", "maissiroop", "rietsuiker"]'::jsonb
      ) AS elem
    ),
    updated_at = NOW()
  FROM public.ingredient_categories c
  WHERE i.category_id = c.id
    AND c.code = 'wahls_forbidden_added_sugar'
    AND i.term = 'sugar';

  -- wahls_limited_non_gluten_grains, term 'corn': maiskorrels, maïs
  UPDATE public.ingredient_category_items i
  SET
    synonyms = (
      SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
      FROM jsonb_array_elements_text(
        COALESCE(i.synonyms, '[]'::jsonb) || '["maiskorrels", "maïs"]'::jsonb
      ) AS elem
    ),
    updated_at = NOW()
  FROM public.ingredient_categories c
  WHERE i.category_id = c.id
    AND c.code = 'wahls_limited_non_gluten_grains'
    AND i.term = 'corn';

  RAISE NOTICE 'ingredient_category_items: Nederlandse synoniemen bijgewerkt (soy, cheese, sugar, corn)';
END
$$;

COMMIT;
