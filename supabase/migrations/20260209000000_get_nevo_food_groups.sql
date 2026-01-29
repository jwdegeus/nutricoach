-- Return all distinct NEVO food groups (for dropdowns). One row per group.
CREATE OR REPLACE FUNCTION public.get_nevo_food_groups()
RETURNS TABLE(food_group_nl text, food_group_en text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT food_group_nl, food_group_en
  FROM nevo_foods
  ORDER BY food_group_nl;
$$;

GRANT EXECUTE ON FUNCTION public.get_nevo_food_groups() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nevo_food_groups() TO anon;
