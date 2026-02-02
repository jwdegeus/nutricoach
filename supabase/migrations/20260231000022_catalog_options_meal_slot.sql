-- Migration: catalog_options – add dimension 'meal_slot' (soort) and seed system options
-- Description: Soort (Ontbijt, Lunch, Diner, Snack, Overig) becomes manageable from admin catalog.
--              Extends dimension CHECK; seed system options with keys breakfast, lunch, dinner, snack, other.

-- ============================================================================
-- Extend dimension CHECK to include meal_slot
-- ============================================================================
ALTER TABLE public.catalog_options
  DROP CONSTRAINT IF EXISTS catalog_options_dimension_check;

ALTER TABLE public.catalog_options
  ADD CONSTRAINT catalog_options_dimension_check
  CHECK (dimension IN ('cuisine', 'protein_type', 'meal_slot'));

COMMENT ON COLUMN public.catalog_options.dimension IS 'Facet: cuisine | protein_type | meal_slot (extensible via new CHECK values).';

-- ============================================================================
-- Seed: system options for meal_slot (soort)
-- ============================================================================
INSERT INTO public.catalog_options (dimension, scope, key, label, sort_order)
VALUES
  ('meal_slot', 'system', 'breakfast', 'Ontbijt', 10),
  ('meal_slot', 'system', 'lunch', 'Lunch', 20),
  ('meal_slot', 'system', 'dinner', 'Diner', 30),
  ('meal_slot', 'system', 'snack', 'Snack', 40),
  ('meal_slot', 'system', 'other', 'Overig', 50)
ON CONFLICT (dimension, key) WHERE (scope = 'system') DO NOTHING;
