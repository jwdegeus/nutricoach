-- Link our ingredient_categories to NEVO food groups (food_group_nl/food_group_en from nevo_foods).
-- One category can be linked to one NEVO group; later we can add ingredients from that NEVO group to our category.

ALTER TABLE public.ingredient_categories
  ADD COLUMN IF NOT EXISTS nevo_food_group_nl TEXT NULL,
  ADD COLUMN IF NOT EXISTS nevo_food_group_en TEXT NULL;

COMMENT ON COLUMN public.ingredient_categories.nevo_food_group_nl IS 'Exacte waarde van nevo_foods.food_group_nl waarmee deze categorie gekoppeld is.';
COMMENT ON COLUMN public.ingredient_categories.nevo_food_group_en IS 'Exacte waarde van nevo_foods.food_group_en (voor weergave).';

CREATE INDEX IF NOT EXISTS idx_ingredient_categories_nevo_food_group_nl
  ON public.ingredient_categories(nevo_food_group_nl)
  WHERE nevo_food_group_nl IS NOT NULL;

-- RPC: distinct NEVO food groups for linking in admin UI
CREATE OR REPLACE FUNCTION public.get_nevo_food_groups()
RETURNS TABLE (food_group_nl text, food_group_en text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT food_group_nl, food_group_en
  FROM nevo_foods
  WHERE food_group_nl IS NOT NULL AND food_group_nl <> ''
  ORDER BY food_group_nl;
$$;

COMMENT ON FUNCTION public.get_nevo_food_groups() IS 'Returns distinct NEVO food group labels for linking ingredient_categories to NEVO groups.';

GRANT EXECUTE ON FUNCTION public.get_nevo_food_groups() TO authenticated;
