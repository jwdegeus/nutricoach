-- Unified ingredient overview: NEVO + AI + custom + FNDDS with source_rank.
-- For admin overview and source filtering. No indexes on view; TODO materialized view if performance needed.

CREATE OR REPLACE VIEW public.ingredient_overview_v1 AS
  -- NEVO (source_rank 1)
  SELECT
    'nevo:' || n.nevo_code AS ingredient_uid,
    'nevo'::text AS source,
    1 AS source_rank,
    n.nevo_code::text AS source_id,
    n.name_nl AS display_name,
    n.name_en AS description,
    n.created_at
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
    c.created_at
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
    c.created_at
  FROM public.custom_foods c
  WHERE c.created_by IS NULL

  UNION ALL

  -- FNDDS Survey (source_rank 4): display_name from translation or fallback to description
  SELECT
    'fndds:' || f.fdc_id AS ingredient_uid,
    'fndds_survey'::text AS source,
    4 AS source_rank,
    f.fdc_id::text AS source_id,
    COALESCE(t.display_name, f.description) AS display_name,
    f.description AS description,
    f.created_at
  FROM public.fndds_survey_foods f
  LEFT JOIN public.fndds_survey_food_translations t
    ON t.fdc_id = f.fdc_id AND t.locale = 'nl-NL';

-- View uses underlying table RLS; no extra write access.
-- Grant select to same roles that can read the base tables.
GRANT SELECT ON public.ingredient_overview_v1 TO authenticated;
GRANT SELECT ON public.ingredient_overview_v1 TO anon;
