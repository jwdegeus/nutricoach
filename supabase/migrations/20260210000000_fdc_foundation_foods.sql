-- Migration: FDC Foundation Foods (4th source alongside NEVO/custom/AI)
-- Description: Table for USDA FDC Foundation Foods from JSON snapshot ingest.
-- Source tag: fdc_foundation. Idempotent upsert on fdc_id. Provenance on record.

CREATE TABLE IF NOT EXISTS public.fdc_foundation_foods (
  fdc_id INTEGER NOT NULL PRIMARY KEY,
  description TEXT NOT NULL,
  food_class TEXT,
  food_nutrients JSONB,
  dataset_filename TEXT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fdc_foundation_foods_description ON public.fdc_foundation_foods USING gin(to_tsvector('english', description));
CREATE INDEX IF NOT EXISTS idx_fdc_foundation_foods_ingested_at ON public.fdc_foundation_foods(ingested_at);

CREATE TRIGGER set_updated_at_fdc_foundation_foods
  BEFORE UPDATE ON public.fdc_foundation_foods
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.fdc_foundation_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FDC foundation foods are publicly readable"
  ON public.fdc_foundation_foods
  FOR SELECT
  USING (true);
