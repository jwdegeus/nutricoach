-- Migration: Pantry items – ondersteuning externe producten (barcode, source, display_name)
-- Description: Items kunnen NEVO zijn (nevo_code) of extern (barcode + source + display_name).
--              Voor AH-matching en producten zonder NEVO-equivalent.

-- ============================================================================
-- Alter table: nullable nevo_code, add barcode, source, display_name
-- ============================================================================
ALTER TABLE public.pantry_items
  ALTER COLUMN nevo_code DROP NOT NULL;

ALTER TABLE public.pantry_items
  ADD COLUMN IF NOT EXISTS barcode TEXT NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NULL,
  ADD COLUMN IF NOT EXISTS display_name TEXT NULL;

COMMENT ON COLUMN public.pantry_items.barcode IS 'EAN/GTIN bij externe producten (OFF, AH)';
COMMENT ON COLUMN public.pantry_items.source IS 'Bron bij externe producten: openfoodfacts, albert_heijn';
COMMENT ON COLUMN public.pantry_items.display_name IS 'Weergavenaam bij externe producten (geen NEVO-lookup)';

-- Constraint: ofwel nevo_code, ofwel (barcode + source)
ALTER TABLE public.pantry_items
  DROP CONSTRAINT IF EXISTS pantry_items_user_nevo_unique;

ALTER TABLE public.pantry_items
  ADD CONSTRAINT pantry_items_nevo_or_external CHECK (
    (nevo_code IS NOT NULL AND barcode IS NULL AND source IS NULL)
    OR (nevo_code IS NULL AND barcode IS NOT NULL AND source IS NOT NULL)
  );

-- Unieke rijen: per user maximaal één per nevo_code, of één per (barcode, source)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pantry_items_user_nevo_unique
  ON public.pantry_items (user_id, nevo_code)
  WHERE nevo_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pantry_items_user_barcode_source_unique
  ON public.pantry_items (user_id, barcode, source)
  WHERE barcode IS NOT NULL AND source IS NOT NULL;

-- Index voor lookups op barcode (toekomstige AH-matching)
CREATE INDEX IF NOT EXISTS idx_pantry_items_barcode ON public.pantry_items(barcode)
  WHERE barcode IS NOT NULL;
