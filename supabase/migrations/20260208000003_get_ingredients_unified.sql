-- Unified ingredients list (nevo + custom) for admin overview, sorted by name_nl.
-- Returns one row per ingredient; first column 'total' is the total count (same on every row).
CREATE OR REPLACE FUNCTION public.get_ingredients_unified(
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  total bigint,
  source text,
  id text,
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
  quantity text,
  created_by uuid
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT count(*) INTO v_total FROM (
    SELECT 1 FROM nevo_foods n
    WHERE (p_search IS NULL OR p_search = '' OR n.name_nl ILIKE '%' || p_search || '%' OR n.name_en ILIKE '%' || p_search || '%')
    UNION ALL
    SELECT 1 FROM custom_foods c
    WHERE (p_search IS NULL OR p_search = '' OR c.name_nl ILIKE '%' || p_search || '%' OR c.name_en ILIKE '%' || p_search || '%')
  ) t;

  RETURN QUERY
  SELECT v_total,
    u.source, u.id, u.nevo_code, u.name_nl, u.name_en, u.food_group_nl, u.food_group_en,
    u.energy_kcal, u.protein_g, u.fat_g, u.carbs_g, u.fiber_g, u.quantity, u.created_by
  FROM (
    (SELECT 'nevo'::text AS source, n.id::text AS id, n.nevo_code, n.name_nl, n.name_en,
      n.food_group_nl, n.food_group_en, n.energy_kcal, n.protein_g, n.fat_g, n.carbs_g, n.fiber_g,
      n.quantity, NULL::uuid AS created_by
     FROM nevo_foods n
     WHERE (p_search IS NULL OR p_search = '' OR n.name_nl ILIKE '%' || p_search || '%' OR n.name_en ILIKE '%' || p_search || '%'))
    UNION ALL
    (SELECT 'custom'::text, c.id::text, NULL::int, c.name_nl, c.name_en,
      c.food_group_nl, c.food_group_en, c.energy_kcal, c.protein_g, c.fat_g, c.carbs_g, c.fiber_g,
      c.quantity, c.created_by
     FROM custom_foods c
     WHERE (p_search IS NULL OR p_search = '' OR c.name_nl ILIKE '%' || p_search || '%' OR c.name_en ILIKE '%' || p_search || '%'))
  ) u
  ORDER BY u.name_nl
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Allow authenticated users to call (API uses service/anon with is_admin check; RLS on tables unchanged)
GRANT EXECUTE ON FUNCTION public.get_ingredients_unified(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ingredients_unified(text, int, int) TO anon;
