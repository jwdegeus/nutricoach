-- Migration: custom_meals → recipe_book_option_id (receptenboek from catalog_options)
-- Description: Link custom_meals to catalog_options for recipe_book (receptenboek).

ALTER TABLE public.custom_meals
  ADD COLUMN IF NOT EXISTS recipe_book_option_id UUID NULL
    REFERENCES public.catalog_options(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.custom_meals.recipe_book_option_id IS 'Optional recipe book from catalog_options (dimension=recipe_book); system or user option.';

-- Extend trigger: validate recipe_book_option_id dimension
CREATE OR REPLACE FUNCTION public.validate_custom_meals_catalog_option_dimension()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  opt_dimension TEXT;
BEGIN
  IF NEW.cuisine_option_id IS NOT NULL THEN
    SELECT dimension INTO opt_dimension FROM public.catalog_options WHERE id = NEW.cuisine_option_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'catalog_options row not found for cuisine_option_id %', NEW.cuisine_option_id; END IF;
    IF opt_dimension <> 'cuisine' THEN RAISE EXCEPTION 'cuisine_option_id must reference dimension cuisine, got %', opt_dimension; END IF;
  END IF;
  IF NEW.protein_type_option_id IS NOT NULL THEN
    SELECT dimension INTO opt_dimension FROM public.catalog_options WHERE id = NEW.protein_type_option_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'catalog_options row not found for protein_type_option_id %', NEW.protein_type_option_id; END IF;
    IF opt_dimension <> 'protein_type' THEN RAISE EXCEPTION 'protein_type_option_id must reference dimension protein_type, got %', opt_dimension; END IF;
  END IF;
  IF NEW.meal_slot_option_id IS NOT NULL THEN
    SELECT dimension INTO opt_dimension FROM public.catalog_options WHERE id = NEW.meal_slot_option_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'catalog_options row not found for meal_slot_option_id %', NEW.meal_slot_option_id; END IF;
    IF opt_dimension <> 'meal_slot' THEN RAISE EXCEPTION 'meal_slot_option_id must reference dimension meal_slot, got %', opt_dimension; END IF;
  END IF;
  IF NEW.recipe_book_option_id IS NOT NULL THEN
    SELECT dimension INTO opt_dimension FROM public.catalog_options WHERE id = NEW.recipe_book_option_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'catalog_options row not found for recipe_book_option_id %', NEW.recipe_book_option_id; END IF;
    IF opt_dimension <> 'recipe_book' THEN RAISE EXCEPTION 'recipe_book_option_id must reference dimension recipe_book, got %', opt_dimension; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_custom_meals_catalog_option_dimension_trigger ON public.custom_meals;
CREATE TRIGGER validate_custom_meals_catalog_option_dimension_trigger
  BEFORE INSERT OR UPDATE OF cuisine_option_id, protein_type_option_id, meal_slot_option_id, recipe_book_option_id
  ON public.custom_meals
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_custom_meals_catalog_option_dimension();

CREATE INDEX IF NOT EXISTS idx_custom_meals_user_recipe_book_option
  ON public.custom_meals(user_id, recipe_book_option_id)
  WHERE recipe_book_option_id IS NOT NULL;
