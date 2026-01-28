-- Query: Wahls Paleo dieetregels vullen uit alle actieve ingredientgroepen
-- Gebruik: run dit script wanneer je (nieuwe) ingredientgroepen als regel voor Wahls Paleo wilt toevoegen.
-- Optioneel: draai eerst "Verwijder bestaande Wahls Paleo regels" als je een schone lei wilt.
-- Bron: docs/diet-logic-plan.md §3.3 Wahls Level 2 (Wahls Paleo)

-- ============================================================================
-- Optie A: Verwijder bestaande Wahls Paleo regels (draai vóór de insert als je reset wilt)
-- ============================================================================
-- DELETE FROM public.diet_category_constraints
-- WHERE diet_type_id = (SELECT id FROM public.diet_types WHERE name = 'Wahls Paleo' LIMIT 1);

-- ============================================================================
-- Optie B: Vul/update regels uit alle actieve ingredientgroepen
-- ============================================================================
-- Gebruikt ON CONFLICT om bestaande rijen te updaten; nieuwe ingredientgroepen worden toegevoegd.
-- Vereist UNIQUE(diet_type_id, category_id, rule_action) op diet_category_constraints.

WITH wahls_paleo_mapping AS (
  SELECT code, diet_logic, strictness, min_per_day, min_per_week, max_per_day, max_per_week, priority
  FROM (VALUES
    ('wahls_leafy_greens', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('wahls_sulfur_rich', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('wahls_colored', 'force', 'hard', 3, NULL, NULL, NULL, 90),
    ('wahls_sea_vegetables', 'force', 'hard', 1, NULL, NULL, NULL, 90),
    ('wahls_organ_meat', 'force', 'hard', NULL, 2, NULL, NULL, 90),
    ('wahls_fermented', 'force', 'hard', 1, NULL, NULL, NULL, 80),
    ('wahls_omega3_fish', 'pass', 'hard', NULL, NULL, NULL, NULL, 70),
    ('wahls_forbidden_gluten', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_dairy', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_soy', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_added_sugar', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_forbidden_ultra_processed', 'drop', 'hard', NULL, NULL, NULL, NULL, 100),
    ('wahls_limited_legumes', 'limit', 'soft', NULL, NULL, NULL, 2, 60),
    ('wahls_limited_non_gluten_grains', 'limit', 'soft', NULL, NULL, NULL, 2, 60),
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
  min_per_day,
  min_per_week,
  max_per_day,
  max_per_week,
  priority,
  priority,
  diet_logic,
  true
FROM diet_and_categories
ON CONFLICT (diet_type_id, category_id, rule_action)
DO UPDATE SET
  constraint_type = EXCLUDED.constraint_type,
  strictness = EXCLUDED.strictness,
  min_per_day = EXCLUDED.min_per_day,
  min_per_week = EXCLUDED.min_per_week,
  max_per_day = EXCLUDED.max_per_day,
  max_per_week = EXCLUDED.max_per_week,
  priority = EXCLUDED.priority,
  rule_priority = EXCLUDED.rule_priority,
  diet_logic = EXCLUDED.diet_logic,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
