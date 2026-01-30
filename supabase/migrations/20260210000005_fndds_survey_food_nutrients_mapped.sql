-- Migration: FNDDS Survey Food Nutrients Mapped (internal keys, per 100g)
-- Description: Materialized nutrient values with internal_nutrient_key + internal_unit for nutrition calculator.
-- Populated by scripts/map-fndds-nutrients.ts from normalized + nutrient_source_mappings.

CREATE TABLE IF NOT EXISTS public.fndds_survey_food_nutrients_mapped (
  fdc_id INTEGER NOT NULL REFERENCES public.fndds_survey_foods(fdc_id) ON DELETE CASCADE,
  internal_nutrient_key TEXT NOT NULL,
  internal_unit TEXT NOT NULL,
  amount_per_100g NUMERIC,
  source TEXT NOT NULL DEFAULT 'fndds_survey',
  nutrient_source_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fdc_id, internal_nutrient_key)
);

CREATE INDEX IF NOT EXISTS idx_fndds_survey_food_nutrients_mapped_internal_key
  ON public.fndds_survey_food_nutrients_mapped(internal_nutrient_key);

CREATE INDEX IF NOT EXISTS idx_fndds_survey_food_nutrients_mapped_fdc_id
  ON public.fndds_survey_food_nutrients_mapped(fdc_id);

CREATE TRIGGER set_updated_at_fndds_survey_food_nutrients_mapped
  BEFORE UPDATE ON public.fndds_survey_food_nutrients_mapped
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.fndds_survey_food_nutrients_mapped ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FNDDS survey food nutrients mapped are publicly readable"
  ON public.fndds_survey_food_nutrients_mapped
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert fndds_survey_food_nutrients_mapped"
  ON public.fndds_survey_food_nutrients_mapped
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update fndds_survey_food_nutrients_mapped"
  ON public.fndds_survey_food_nutrients_mapped
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete fndds_survey_food_nutrients_mapped"
  ON public.fndds_survey_food_nutrients_mapped
  FOR DELETE
  USING (public.is_admin(auth.uid()));
