-- Migration: catalog_options – add dimension 'recipe_book' (receptenboek)
-- Description: Receptenboek becomes manageable from admin catalog, same pattern as cuisine/protein_type.

ALTER TABLE public.catalog_options
  DROP CONSTRAINT IF EXISTS catalog_options_dimension_check;

ALTER TABLE public.catalog_options
  ADD CONSTRAINT catalog_options_dimension_check
  CHECK (dimension IN ('cuisine', 'protein_type', 'meal_slot', 'recipe_book'));

COMMENT ON COLUMN public.catalog_options.dimension IS 'Facet: cuisine | protein_type | meal_slot | recipe_book (extensible via new CHECK values).';
