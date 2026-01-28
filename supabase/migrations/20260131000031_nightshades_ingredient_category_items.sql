-- Migration: Nachtschades – ingredient_category_items toevoegen
-- Created: 2026-01-31
-- Description: De categorie "nightshades" (Nachtschades) had geen items in de DB,
--   waardoor recept-analyse nooit op paprikapoeder, tomaat, etc. matchte.
--   Voegt termen + Nederlandse synoniemen toe (o.a. paprikapoeder bij paprika).

-- ============================================================================
-- Ingredient category items voor nightshades (Nachtschades)
-- ============================================================================

INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
SELECT ic.id, 'tomato', 'tomaat',
  '["tomaat", "tomato", "tomatoes", "tomaten", "cherry tomato", "cherrytomaat", "cherrytomaatjes", "tomaatjes"]'::jsonb,
  1
FROM public.ingredient_categories ic
WHERE ic.code = 'nightshades'
ON CONFLICT (category_id, term) DO UPDATE SET
  synonyms = EXCLUDED.synonyms,
  term_nl = EXCLUDED.term_nl,
  is_active = true,
  updated_at = NOW();

INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
SELECT ic.id, 'potato', 'aardappel',
  '["aardappel", "potato", "potatoes", "aardappelen"]'::jsonb,
  2
FROM public.ingredient_categories ic
WHERE ic.code = 'nightshades'
ON CONFLICT (category_id, term) DO UPDATE SET
  synonyms = EXCLUDED.synonyms,
  term_nl = EXCLUDED.term_nl,
  is_active = true,
  updated_at = NOW();

INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
SELECT ic.id, 'eggplant', 'aubergine',
  '["aubergine", "eggplant"]'::jsonb,
  3
FROM public.ingredient_categories ic
WHERE ic.code = 'nightshades'
ON CONFLICT (category_id, term) DO UPDATE SET
  synonyms = EXCLUDED.synonyms,
  term_nl = EXCLUDED.term_nl,
  is_active = true,
  updated_at = NOW();

-- paprika: expliciet paprikapoeder, zoete paprikapoeder, gerookte paprikapoeder e.d. als synonym
INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
SELECT ic.id, 'paprika', 'paprika',
  '["paprikapoeder", "zoete paprika", "zoete paprikapoeder", "gerookte paprikapoeder", "sweet paprika", "bell pepper", "peppers", "red pepper", "rode paprika", "yellow pepper", "gele paprika", "paprika powder", "cayenne"]'::jsonb,
  4
FROM public.ingredient_categories ic
WHERE ic.code = 'nightshades'
ON CONFLICT (category_id, term) DO UPDATE SET
  synonyms = EXCLUDED.synonyms,
  term_nl = EXCLUDED.term_nl,
  is_active = true,
  updated_at = NOW();

INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
SELECT ic.id, 'chili', 'chili',
  '["chilipoeder", "chili pepper", "chili peppers", "chilipeper", "cayenne", "paprika"]'::jsonb,
  5
FROM public.ingredient_categories ic
WHERE ic.code = 'nightshades'
ON CONFLICT (category_id, term) DO UPDATE SET
  synonyms = EXCLUDED.synonyms,
  term_nl = EXCLUDED.term_nl,
  is_active = true,
  updated_at = NOW();
