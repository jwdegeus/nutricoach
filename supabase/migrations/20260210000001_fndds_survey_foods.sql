-- Migration: FNDDS Survey Foods (FNDDS = Food and Nutrient Database for Dietary Studies)
-- Description: Table for USDA FNDDS survey foods from JSON snapshot (e.g. surveyDownload.json).
-- Source tag: fndds_survey. Idempotent upsert on fdc_id. Provenance on record.

CREATE TABLE IF NOT EXISTS public.fndds_survey_foods (
  fdc_id INTEGER NOT NULL PRIMARY KEY,
  description TEXT NOT NULL,
  food_code INTEGER,
  food_class TEXT,
  wweia_food_category TEXT,
  food_nutrients JSONB,
  dataset_filename TEXT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fndds_survey_foods_description ON public.fndds_survey_foods USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_fndds_survey_foods_food_code ON public.fndds_survey_foods(food_code);
CREATE INDEX IF NOT EXISTS idx_fndds_survey_foods_ingested_at ON public.fndds_survey_foods(ingested_at);

CREATE TRIGGER set_updated_at_fndds_survey_foods
  BEFORE UPDATE ON public.fndds_survey_foods
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.fndds_survey_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FNDDS survey foods are publicly readable"
  ON public.fndds_survey_foods
  FOR SELECT
  USING (true);
