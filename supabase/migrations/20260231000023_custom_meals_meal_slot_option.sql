-- Migration: custom_meals → meal_slot_option_id (soort from catalog_options)
-- Description: Link custom_meals to catalog_options for meal_slot (soort).
--              Dimension validation via trigger; FK ON DELETE SET NULL.
--              Backfill meal_slot_option_id from meal_slot using catalog key.

-- ============================================================================
-- ALTER TABLE custom_meals: meal_slot_option_id
-- ============================================================================
ALTER TABLE public.custom_meals
  ADD COLUMN IF NOT EXISTS meal_slot_option_id UUID NULL
    REFERENCES public.catalog_options(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.custom_meals.meal_slot_option_id IS 'Optional meal type (soort) from catalog_options (dimension=meal_slot); system or user option.';

-- ============================================================================
-- Trigger: extend dimension validation to include meal_slot_option_id
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

  IF NEW.meal_slot_option_id IS NOT NULL THEN
    SELECT dimension INTO opt_dimension
    FROM public.catalog_options
    WHERE id = NEW.meal_slot_option_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'catalog_options row not found or not visible for meal_slot_option_id %', NEW.meal_slot_option_id;
    END IF;
    IF opt_dimension <> 'meal_slot' THEN
      RAISE EXCEPTION 'meal_slot_option_id must reference an option with dimension meal_slot, got %', opt_dimension;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_custom_meals_catalog_option_dimension_trigger ON public.custom_meals;
CREATE TRIGGER validate_custom_meals_catalog_option_dimension_trigger
  BEFORE INSERT OR UPDATE OF cuisine_option_id, protein_type_option_id, meal_slot_option_id
  ON public.custom_meals
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_custom_meals_catalog_option_dimension();

-- ============================================================================
-- Index (partial, for filter lookups)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_custom_meals_user_meal_slot_option
  ON public.custom_meals(user_id, meal_slot_option_id)
  WHERE meal_slot_option_id IS NOT NULL;

-- ============================================================================
-- Backfill: set meal_slot_option_id from meal_slot where key matches
-- ============================================================================
UPDATE public.custom_meals m
SET meal_slot_option_id = o.id
FROM public.catalog_options o
WHERE o.dimension = 'meal_slot'
  AND o.scope = 'system'
  AND o.key = m.meal_slot
  AND m.meal_slot IS NOT NULL
  AND m.meal_slot_option_id IS NULL;
