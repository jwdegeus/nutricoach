-- Migration: Wahls Diet (Level 1) – dieetregels vullen
-- Created: 2026-01-31
-- Description: Vult diet_category_constraints voor "Wahls Diet" (Level 1).
--   Level 1 is minder strikt dan Wahls Paleo (L2): LIMIT ipv DROP voor legumes/non-gluten grains,
--   FORCE alleen 3-3-3 groenten; sea/organ/fermented/omega3 zijn PASS.
-- Bron: docs/diet-logic-plan.md §3.3 Wahls Level 1 (Wahls Diet)

-- ============================================================================
-- Step 1: Verwijder bestaande dieetregels voor Wahls Diet (idempotent)
-- ============================================================================

DELETE FROM public.diet_category_constraints
WHERE diet_type_id = (SELECT id FROM public.diet_types WHERE name = 'Wahls Diet' LIMIT 1);

-- ============================================================================
-- Step 2: Mapping Wahls Diet (Level 1) per ingredientgroep-code
-- ============================================================================
-- Diet Logic: drop | force | limit | pass
-- FORCE: min_per_day / min_per_week; LIMIT: max_per_day / max_per_week
-- L1: LIMIT legumes + non_gluten_grains met max 1/dag (doc); FORCE alleen 3-3-3 groenten.

WITH wahls_diet_mapping AS (
  SELECT code, diet_logic, strictness,
    min_per_day::integer AS min_per_day,
    min_per_week::integer AS min_per_week,
    max_per_day::integer AS max_per_day,
    max_per_week::integer AS max_per_week,
    priority::integer AS priority
  FROM (VALUES
    -- FORCE (3-3-3 groenten) – zelfde als L2 voor deze drie
    ('wahls_leafy_greens', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('wahls_sulfur_rich', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('wahls_colored', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    -- PASS voor L1 (niet verplicht zoals in L2)
    ('wahls_sea_vegetables', 'pass', 'hard', NULL, NULL, NULL, NULL, 70),
    ('wahls_organ_meat', 'pass', 'hard', NULL, NULL, NULL, NULL, 70),
    ('wahls_fermented', 'pass', 'hard', NULL, NULL, NULL, NULL, 70),
    ('wahls_omega3_fish', 'pass', 'hard', NULL, NULL, NULL, NULL, 70),
    -- DROP (blokkeren) –zelfde als L2
    ('wahls_forbidden_gluten', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_dairy', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_soy', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_added_sugar', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_ultra_processed', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    -- LIMIT (beperkt) – L1: max 1/dag (doc §3.3)
    ('wahls_limited_legumes', 'limit', 'soft', NULL, NULL, 1, NULL, 60),
    ('wahls_limited_non_gluten_grains', 'limit', 'soft', NULL, NULL, 1, NULL, 60),
    -- Generieke codes: drop/force/pass/limit conform L1
    ('dairy', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('gluten_containing_grains', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('processed_sugar', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('alcohol', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('leafy_vegetables', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('sulfur_vegetables', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('colored_vegetables', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('legumes', 'limit', 'soft', NULL, NULL, 1, NULL, 60),
    ('organ_meats', 'pass', 'hard', NULL, NULL, NULL, NULL, 50),
    ('seaweed', 'pass', 'hard', NULL, NULL, NULL, NULL, 50),
    ('fermented_foods', 'pass', 'hard', NULL, NULL, NULL, NULL, 50),
    ('nightshades', 'pass', 'hard', NULL, NULL, NULL, NULL, 50),
    ('nuts', 'pass', 'hard', NULL, NULL, NULL, NULL, 50),
    ('eggs', 'pass', 'hard', NULL, NULL, NULL, NULL, 50),
    ('shellfish', 'pass', 'hard', NULL, NULL, NULL, NULL, 50)
  ) AS t(code, diet_logic, strictness, min_per_day, min_per_week, max_per_day, max_per_week, priority)
),
diet_and_categories AS (
  SELECT
    dt.id AS diet_type_id,
    ic.id AS category_id,
    COALESCE(m.diet_logic, 'pass') AS diet_logic,
    COALESCE(m.strictness, 'hard') AS strictness,
    m.min_per_day,
    m.min_per_week,
    m.max_per_day,
    m.max_per_week,
    COALESCE(m.priority, 50) AS priority
  FROM public.diet_types dt
  CROSS JOIN public.ingredient_categories ic
  LEFT JOIN wahls_diet_mapping m ON m.code = ic.code
  WHERE dt.name = 'Wahls Diet'
    AND ic.is_active = true
)
INSERT INTO public.diet_category_constraints (
  diet_type_id,
  category_id,
  constraint_type,
  rule_action,
  strictness,
  min_per_day,
  min_per_week,
  max_per_day,
  max_per_week,
  priority,
  rule_priority,
  diet_logic,
  is_active
)
SELECT
  diet_type_id,
  category_id,
  CASE WHEN diet_logic IN ('force', 'pass') THEN 'required'::TEXT ELSE 'forbidden'::TEXT END,
  CASE WHEN diet_logic IN ('force', 'pass') THEN 'allow'::TEXT ELSE 'block'::TEXT END,
  strictness,
  min_per_day::integer,
  min_per_week::integer,
  max_per_day::integer,
  max_per_week::integer,
  priority::integer,
  priority::integer,
  diet_logic,
  true
FROM diet_and_categories;
