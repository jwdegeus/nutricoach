-- Link custom_foods to NutriCoach ingredient group and optional FNDDS category.
ALTER TABLE public.custom_foods
  ADD COLUMN IF NOT EXISTS ingredient_category_id UUID NULL REFERENCES public.ingredient_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fndds_food_group_nl TEXT NULL;

COMMENT ON COLUMN public.custom_foods.ingredient_category_id IS 'NutriCoach ingredient group (ingredient_category) this custom ingredient belongs to.';
COMMENT ON COLUMN public.custom_foods.fndds_food_group_nl IS 'FNDDS food group (NL) for display/filtering when mapping to FNDDS.';
