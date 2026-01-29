-- Count and list NEVO foods that are not linked to any ingredient category (ingredient_category_items.nevo_food_id).
-- Used for admin dashboard "Ingrediënten zonder categorie" and filtered list.

CREATE OR REPLACE FUNCTION public.get_nevo_without_category_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM nevo_foods n
  WHERE NOT EXISTS (
    SELECT 1 FROM ingredient_category_items i
    WHERE i.nevo_food_id = n.id
  );
$$;

COMMENT ON FUNCTION public.get_nevo_without_category_count() IS 'Aantal NEVO-voedingsmiddelen die nog aan geen enkele ingredientcategorie zijn gekoppeld.';

CREATE OR REPLACE FUNCTION public.get_nevo_without_category(
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  total bigint,
  id int,
  nevo_code int,
  name_nl text,
  name_en text,
  food_group_nl text,
  food_group_en text,
  energy_kcal numeric,
  protein_g numeric,
  fat_g numeric,
  carbs_g numeric,
  fiber_g numeric,
  quantity text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT COUNT(*)::bigint INTO v_total
  FROM nevo_foods n
  WHERE NOT EXISTS (
    SELECT 1 FROM ingredient_category_items i
    WHERE i.nevo_food_id = n.id
  )
  AND (p_search IS NULL OR p_search = '' OR n.name_nl ILIKE '%' || p_search || '%' OR n.name_en ILIKE '%' || p_search || '%');

  RETURN QUERY
  SELECT v_total,
    n.id, n.nevo_code, n.name_nl, n.name_en,
    n.food_group_nl, n.food_group_en,
    n.energy_kcal, n.protein_g, n.fat_g, n.carbs_g, n.fiber_g, n.quantity
  FROM nevo_foods n
  WHERE NOT EXISTS (
    SELECT 1 FROM ingredient_category_items i
    WHERE i.nevo_food_id = n.id
  )
  AND (p_search IS NULL OR p_search = '' OR n.name_nl ILIKE '%' || p_search || '%' OR n.name_en ILIKE '%' || p_search || '%')
  ORDER BY n.name_nl
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_nevo_without_category(text, int, int) IS 'NEVO-voedingsmiddelen zonder categorie, voor gefilterd admin-overzicht.';

GRANT EXECUTE ON FUNCTION public.get_nevo_without_category_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nevo_without_category_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_nevo_without_category(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nevo_without_category(text, int, int) TO anon;
