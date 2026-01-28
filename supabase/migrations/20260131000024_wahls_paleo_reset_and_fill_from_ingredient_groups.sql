-- Migration: Wahls Paleo – alle dieetregels verwijderen en opnieuw vullen uit ingredientgroepen
-- Created: 2026-01-31
-- Description:
--   1. Verwijder alle bestaande dieetregels (diet_category_constraints) voor Wahls Paleo.
--   2. Voeg voor elke actieve ingredientgroep (ingredient_categories) een regel toe voor Wahls Paleo,
--      met diet_logic, prioriteit, striktheid en min/max per dag/week conform het Wahls Paleo (Level 2) protocol.
-- Bron: docs/diet-logic-plan.md §3.3 Wahls Level 2 (Wahls Paleo)

-- ============================================================================
-- Step 1: Verwijder alle Wahls Paleo dieetregels
-- ============================================================================

DELETE FROM public.diet_category_constraints
WHERE diet_type_id = (SELECT id FROM public.diet_types WHERE name = 'Wahls Paleo' LIMIT 1);

-- ============================================================================
-- Step 2: Mapping Wahls Paleo (Level 2) per ingredientgroep-code
-- ============================================================================
-- Diet Logic: drop | force | limit | pass
-- FORCE: min_per_day / min_per_week; LIMIT: max_per_day / max_per_week
-- Prioriteit: 1 = hoogst, 65500 = laagst (hier gebruiken we 50–100 voor leesbaarheid)

WITH wahls_paleo_mapping AS (
  SELECT code, diet_logic, strictness,
    min_per_day::integer AS min_per_day,
    min_per_week::integer AS min_per_week,
    max_per_day::integer AS max_per_day,
    max_per_week::integer AS max_per_week,
    priority::integer AS priority
  FROM (VALUES
    -- FORCE (verplicht quotum) — eerste rij bepaalt types: integer kolommen expliciet
    ('wahls_leafy_greens', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('wahls_sulfur_rich', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('wahls_colored', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('wahls_sea_vegetables', 'force', 'hard', 1, NULL, NULL, NULL, 90),
    ('wahls_organ_meat', 'force', 'hard', NULL, 2, NULL, NULL, 90),
    ('wahls_fermented', 'force', 'hard', 1, NULL, NULL, NULL, 80),
    -- PASS (toegestaan)
    ('wahls_omega3_fish', 'pass', 'hard', NULL, NULL, NULL, NULL, 70),
    -- DROP (blokkeren)
    ('wahls_forbidden_gluten', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_dairy', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_soy', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_added_sugar', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_ultra_processed', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    -- LIMIT (beperkt) – max per week
    ('wahls_limited_legumes', 'limit', 'soft', NULL, NULL, NULL, 2, 60),
    ('wahls_limited_non_gluten_grains', 'limit', 'soft', NULL, NULL, NULL, 2, 60),
    -- Generieke codes (ingredient_categories uit 20260131000006) mappen op Wahls Paleo
    ('dairy', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('gluten_containing_grains', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('legumes', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('processed_sugar', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('alcohol', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('leafy_vegetables', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('sulfur_vegetables', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('colored_vegetables', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('organ_meats', 'force', 'hard', NULL, 2, NULL, NULL, 90),
    ('seaweed', 'force', 'hard', 1, NULL, NULL, NULL, 90),
    ('fermented_foods', 'force', 'hard', 1, NULL, NULL, NULL, 80),
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
  LEFT JOIN wahls_paleo_mapping m ON m.code = ic.code
  WHERE dt.name = 'Wahls Paleo'
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
