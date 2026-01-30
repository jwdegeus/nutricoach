-- Ingredient state overrides: enable/disable per ingredient_uid (any source).
-- ingredient_uid matches ingredient_overview_v1: nevo:..., ai:..., custom:..., fndds:...

CREATE TABLE public.ingredient_state_overrides (
  ingredient_uid text NOT NULL PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT true,
  disabled_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ingredient_state_overrides IS 'Override enabled/disabled state per ingredient (all sources).';
COMMENT ON COLUMN public.ingredient_state_overrides.ingredient_uid IS 'Same UID as in ingredient_overview_v1 (e.g. nevo:123, fndds:456).';
COMMENT ON COLUMN public.ingredient_state_overrides.disabled_reason IS 'Optional reason for disabling (e.g. duplicate of NEVO).';

ALTER TABLE public.ingredient_state_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ingredient state overrides are readable by authenticated"
  ON public.ingredient_state_overrides
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Ingredient state overrides are readable by anon"
  ON public.ingredient_state_overrides
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Admins can insert ingredient_state_overrides"
  ON public.ingredient_state_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update ingredient_state_overrides"
  ON public.ingredient_state_overrides
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete ingredient_state_overrides"
  ON public.ingredient_state_overrides
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Extend ingredient_overview_v1 with is_enabled (no filtering; UI decides what to show).
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

  -- AI-generated (source_rank 2)
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

  -- Custom / eigen (source_rank 3)
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
    ON t.fdc_id = f.fdc_id AND t.locale = 'nl-NL'
) base
LEFT JOIN public.ingredient_state_overrides o ON o.ingredient_uid = base.ingredient_uid;

-- View grants unchanged
GRANT SELECT ON public.ingredient_overview_v1 TO authenticated;
GRANT SELECT ON public.ingredient_overview_v1 TO anon;
