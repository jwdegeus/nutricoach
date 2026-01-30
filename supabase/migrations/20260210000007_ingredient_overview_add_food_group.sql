-- Add food_group_nl to ingredient overview so admins can see (and filter) categories for AI/custom ingredients.

CREATE OR REPLACE VIEW public.ingredient_overview_v1 AS
  -- NEVO (source_rank 1)
  SELECT
    'nevo:' || n.nevo_code AS ingredient_uid,
    'nevo'::text AS source,
    1 AS source_rank,
    n.nevo_code::text AS source_id,
    n.name_nl AS display_name,
    n.name_en AS description,
    n.created_at,
    n.food_group_nl AS food_group_nl
  FROM public.nevo_foods n

  UNION ALL

  -- AI-generated (custom_foods with created_by set) (source_rank 2)
  SELECT
    'ai:' || c.id AS ingredient_uid,
    'ai'::text AS source,
    2 AS source_rank,
    c.id::text AS source_id,
    c.name_nl AS display_name,
    c.name_en AS description,
    c.created_at,
    c.food_group_nl AS food_group_nl
  FROM public.custom_foods c
  WHERE c.created_by IS NOT NULL

  UNION ALL

  -- Custom / eigen (custom_foods without created_by) (source_rank 3)
  SELECT
    'custom:' || c.id AS ingredient_uid,
    'custom'::text AS source,
    3 AS source_rank,
    c.id::text AS source_id,
    c.name_nl AS display_name,
    c.name_en AS description,
    c.created_at,
    c.food_group_nl AS food_group_nl
  FROM public.custom_foods c
  WHERE c.created_by IS NULL

  UNION ALL

  -- FNDDS Survey (source_rank 4)
  SELECT
    'fndds:' || f.fdc_id AS ingredient_uid,
    'fndds_survey'::text AS source,
    4 AS source_rank,
    f.fdc_id::text AS source_id,
    COALESCE(t.display_name, f.description) AS display_name,
    f.description AS description,
    f.created_at,
    NULL::text AS food_group_nl
  FROM public.fndds_survey_foods f
  LEFT JOIN public.fndds_survey_food_translations t
    ON t.fdc_id = f.fdc_id AND t.locale = 'nl-NL';
