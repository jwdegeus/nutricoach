-- Migration: Sync Wahls Paleo Dieetregels – diet_logic voor Limited
-- Created: 2026-01-31
-- Description: Zet diet_logic = 'limit' en max_per_week voor Wahls Paleo Limited-categorieën.
-- Draait na 20260131000018_diet_logic_dieetregels.sql.

UPDATE public.diet_category_constraints dcc
SET
  diet_logic = 'limit',
  max_per_week = 2
FROM public.diet_types dt,
     public.ingredient_categories ic
WHERE dcc.diet_type_id = dt.id
  AND dcc.category_id = ic.id
  AND dt.name = 'Wahls Paleo'
  AND ic.code IN ('wahls_limited_legumes', 'wahls_limited_non_gluten_grains');
