-- Migration: custom_meals → catalog_options (cuisine_option_id, protein_type_option_id)
-- Description: Link custom_meals to catalog_options for cuisine and protein_type facets.
--              Dimension validation via trigger; FKs ON DELETE SET NULL.
-- Security: RLS on custom_meals unchanged; catalog_options RLS applies for lookups.
-- Out of scope: UI, listMealsAction filters, admin catalog UI.

-- ============================================================================
-- ALTER TABLE custom_meals: new columns + FKs
-- ============================================================================
ALTER TABLE public.custom_meals
  ADD COLUMN IF NOT EXISTS cuisine_option_id UUID NULL
    REFERENCES public.catalog_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS protein_type_option_id UUID NULL
    REFERENCES public.catalog_options(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.custom_meals.cuisine_option_id IS 'Optional cuisine from catalog_options (dimension=cuisine); system or user option.';
COMMENT ON COLUMN public.custom_meals.protein_type_option_id IS 'Optional protein type from catalog_options (dimension=protein_type); system or user option.';

-- ============================================================================
-- Trigger: validate dimension for cuisine_option_id and protein_type_option_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_custom_meals_catalog_option_dimension()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  opt_dimension TEXT;
BEGIN
  IF NEW.cuisine_option_id IS NOT NULL THEN
    SELECT dimension INTO opt_dimension
    FROM public.catalog_options
    WHERE id = NEW.cuisine_option_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'catalog_options row not found or not visible for cuisine_option_id %', NEW.cuisine_option_id;
    END IF;
    IF opt_dimension <> 'cuisine' THEN
      RAISE EXCEPTION 'cuisine_option_id must reference an option with dimension cuisine, got %', opt_dimension;
    END IF;
  END IF;

  IF NEW.protein_type_option_id IS NOT NULL THEN
    SELECT dimension INTO opt_dimension
    FROM public.catalog_options
    WHERE id = NEW.protein_type_option_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'catalog_options row not found or not visible for protein_type_option_id %', NEW.protein_type_option_id;
    END IF;
    IF opt_dimension <> 'protein_type' THEN
      RAISE EXCEPTION 'protein_type_option_id must reference an option with dimension protein_type, got %', opt_dimension;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_custom_meals_catalog_option_dimension() IS 'Ensures cuisine_option_id/protein_type_option_id reference catalog_options with correct dimension.';

DROP TRIGGER IF EXISTS validate_custom_meals_catalog_option_dimension_trigger ON public.custom_meals;
CREATE TRIGGER validate_custom_meals_catalog_option_dimension_trigger
  BEFORE INSERT OR UPDATE OF cuisine_option_id, protein_type_option_id
  ON public.custom_meals
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_custom_meals_catalog_option_dimension();

-- ============================================================================
-- Indexes (partial, for filter lookups)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_custom_meals_user_cuisine_option
  ON public.custom_meals(user_id, cuisine_option_id)
  WHERE cuisine_option_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custom_meals_user_protein_type_option
  ON public.custom_meals(user_id, protein_type_option_id)
  WHERE protein_type_option_id IS NOT NULL;

-- ============================================================================
-- Validatie (voorbeeldqueries in comments – geen SELECT *)
-- ============================================================================
-- Recept bijwerken met cuisine + protein type (als user de opties mag zien):
--   UPDATE public.custom_meals
--   SET cuisine_option_id = '.<catalog_option_id>.', protein_type_option_id = '.<catalog_option_id>.'
--   WHERE id = '.<meal_id>.' AND user_id = auth.uid();
--
-- Recepten met een bepaalde cuisine (filter):
--   SELECT id, name, meal_slot, cuisine_option_id, protein_type_option_id
--   FROM public.custom_meals
--   WHERE user_id = auth.uid() AND cuisine_option_id = '.<option_id>.';
--
-- Recepten met een bepaald protein type:
--   SELECT id, name, meal_slot, cuisine_option_id, protein_type_option_id
--   FROM public.custom_meals
--   WHERE user_id = auth.uid() AND protein_type_option_id = '.<option_id>.';
--
-- Label van gekoppelde optie ophalen (minimale kolommen):
--   SELECT c.id, c.name, o.label AS cuisine_label, p.label AS protein_type_label
--   FROM public.custom_meals c
--   LEFT JOIN public.catalog_options o ON o.id = c.cuisine_option_id
--   LEFT JOIN public.catalog_options p ON p.id = c.protein_type_option_id
--   WHERE c.user_id = auth.uid();
--
-- FKs: ON DELETE SET NULL. Dimension: enforced by trigger (cuisine_option_id → dimension cuisine; protein_type_option_id → dimension protein_type).
