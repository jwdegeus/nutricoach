-- Migration: FNDDS Survey Food Nutrients Normalized
-- Description: Queryable nutrient rows extracted from food_nutrients JSONB; source-native keys, per-100g where known.

CREATE TABLE IF NOT EXISTS public.fndds_survey_food_nutrients_normalized (
  fdc_id INTEGER NOT NULL REFERENCES public.fndds_survey_foods(fdc_id) ON DELETE CASCADE,
  nutrient_source_key TEXT NOT NULL,
  nutrient_name TEXT,
  unit TEXT NOT NULL,
  amount NUMERIC,
  amount_per_100g NUMERIC,
  derivation TEXT,
  raw JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fdc_id, nutrient_source_key)
);

CREATE INDEX IF NOT EXISTS idx_fndds_survey_food_nutrients_nutrient_key
  ON public.fndds_survey_food_nutrients_normalized(nutrient_source_key);

CREATE INDEX IF NOT EXISTS idx_fndds_survey_food_nutrients_fdc_id
  ON public.fndds_survey_food_nutrients_normalized(fdc_id);

CREATE TRIGGER set_updated_at_fndds_survey_food_nutrients_normalized
  BEFORE UPDATE ON public.fndds_survey_food_nutrients_normalized
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.fndds_survey_food_nutrients_normalized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FNDDS survey food nutrients normalized are publicly readable"
  ON public.fndds_survey_food_nutrients_normalized
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert fndds_survey_food_nutrients_normalized"
  ON public.fndds_survey_food_nutrients_normalized
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update fndds_survey_food_nutrients_normalized"
  ON public.fndds_survey_food_nutrients_normalized
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete fndds_survey_food_nutrients_normalized"
  ON public.fndds_survey_food_nutrients_normalized
  FOR DELETE
  USING (public.is_admin(auth.uid()));
