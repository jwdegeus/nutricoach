-- FNDDS: admin UPDATE/DELETE on fndds_survey_foods; food_group in translations; view shows food_group for FNDDS.

-- Admins can update/delete FNDDS survey foods (for edit/delete in admin same as NEVO/custom).
CREATE POLICY "Admins can update fndds_survey_foods"
  ON public.fndds_survey_foods
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete fndds_survey_foods"
  ON public.fndds_survey_foods
  FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Store food_group_nl/en for FNDDS in translations (same semantics as NEVO/custom).
ALTER TABLE public.fndds_survey_food_translations
  ADD COLUMN IF NOT EXISTS food_group_nl TEXT,
  ADD COLUMN IF NOT EXISTS food_group_en TEXT;

-- ingredient_overview_v1: show food_group_nl for FNDDS from translations.
CREATE OR REPLACE VIEW public.ingredient_overview_v1 AS
SELECT
  base.ingredient_uid,
  base.source,
  base.source_rank,
  base.source_id,
  base.display_name,
  base.description,
  base.created_at,
  base.food_group_nl,
  COALESCE(o.is_enabled, true) AS is_enabled
FROM (
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

  SELECT
    'fndds:' || f.fdc_id AS ingredient_uid,
    'fndds_survey'::text AS source,
    4 AS source_rank,
    f.fdc_id::text AS source_id,
    COALESCE(t.display_name, f.description) AS display_name,
    f.description AS description,
    f.created_at,
    t.food_group_nl AS food_group_nl
  FROM public.fndds_survey_foods f
  LEFT JOIN public.fndds_survey_food_translations t
    ON t.fdc_id = f.fdc_id AND t.locale = 'nl-NL'
) base
LEFT JOIN public.ingredient_state_overrides o ON o.ingredient_uid = base.ingredient_uid;

GRANT SELECT ON public.ingredient_overview_v1 TO authenticated;
GRANT SELECT ON public.ingredient_overview_v1 TO anon;
