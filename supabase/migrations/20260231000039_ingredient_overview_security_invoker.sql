-- Fix: ingredient_overview_v1 ran with view-owner (definer) privileges, bypassing RLS.
-- Replace with SECURITY INVOKER functions so callers' RLS applies. Drop the view and
-- use get_ingredient_overview_v1() for SQL callers and get_ingredient_overview_paginated() for the app.

-- 1) SECURITY INVOKER function: same result set as the former view (for RPCs and SQL).
CREATE OR REPLACE FUNCTION public.get_ingredient_overview_v1()
RETURNS TABLE(
  ingredient_uid text,
  source text,
  source_rank integer,
  source_id text,
  display_name text,
  description text,
  created_at timestamptz,
  food_group_nl text,
  is_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    base.ingredient_uid,
    base.source,
    base.source_rank,
    base.source_id,
    base.display_name,
    base.description,
    base.created_at,
    base.food_group_nl,
    COALESCE(o.is_enabled, true) AS is_enabled
  FROM (
    SELECT
      'nevo:' || n.nevo_code AS ingredient_uid,
      'nevo'::text AS source,
      1 AS source_rank,
      n.id::text AS source_id,
      n.name_nl AS display_name,
      n.name_en AS description,
      n.created_at,
      n.food_group_nl AS food_group_nl
    FROM public.nevo_foods n

    UNION ALL

    SELECT
      'ai:' || c.id AS ingredient_uid,
      'ai'::text AS source,
      2 AS source_rank,
      c.id::text AS source_id,
      c.name_nl AS display_name,
      c.name_en AS description,
      c.created_at,
      c.food_group_nl AS food_group_nl
    FROM public.custom_foods c
    WHERE c.created_by IS NOT NULL

    UNION ALL

    SELECT
      'custom:' || c.id AS ingredient_uid,
      'custom'::text AS source,
      3 AS source_rank,
      c.id::text AS source_id,
      c.name_nl AS display_name,
      c.name_en AS description,
      c.created_at,
      c.food_group_nl AS food_group_nl
    FROM public.custom_foods c
    WHERE c.created_by IS NULL

    UNION ALL

    SELECT
      'fndds:' || f.fdc_id AS ingredient_uid,
      'fndds_survey'::text AS source,
      4 AS source_rank,
      f.fdc_id::text AS source_id,
      COALESCE(t.display_name, f.description) AS display_name,
      f.description AS description,
      f.created_at,
      t.food_group_nl AS food_group_nl
    FROM public.fndds_survey_foods f
    LEFT JOIN public.fndds_survey_food_translations t
      ON t.fdc_id = f.fdc_id AND t.locale = 'nl-NL'
  ) base
  LEFT JOIN public.ingredient_state_overrides o ON o.ingredient_uid = base.ingredient_uid
$$;

COMMENT ON FUNCTION public.get_ingredient_overview_v1() IS
  'Ingredient overview (NEVO + AI + custom + FNDDS) with caller privileges; RLS applies. Replaces view ingredient_overview_v1.';

-- 2) Paginated variant for the app: filter, sort, limit/offset, and total count.
CREATE OR REPLACE FUNCTION public.get_ingredient_overview_paginated(
  p_source text DEFAULT 'all',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_q text DEFAULT NULL
)
RETURNS TABLE(rows jsonb, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_total_count bigint;
  v_safe_q text;
BEGIN
  v_safe_q := NULL;
  IF p_q IS NOT NULL AND length(trim(p_q)) > 0 AND length(trim(p_q)) <= 200 THEN
    v_safe_q := '%' || replace(replace(replace(trim(p_q), '%', '\%'), '_', '\_'), ',', ' ') || '%';
  END IF;

  WITH base AS (
    SELECT * FROM public.get_ingredient_overview_v1()
  ),
  filtered AS (
    SELECT *
    FROM base
    WHERE (p_source = 'all' OR source = p_source)
      AND (v_safe_q IS NULL OR display_name ILIKE v_safe_q OR description ILIKE v_safe_q)
  ),
  paged AS (
    SELECT to_jsonb(t) AS r
    FROM (
      SELECT ingredient_uid, source, source_rank, source_id, display_name, description, created_at, food_group_nl, is_enabled
      FROM filtered
      ORDER BY source_rank ASC, display_name ASC
      LIMIT least(greatest(p_limit, 1), 200)
      OFFSET greatest(p_offset, 0)
    ) t
  )
  SELECT (SELECT jsonb_agg(p.r) FROM paged p), (SELECT count(*)::bigint FROM filtered)
  INTO v_rows, v_total_count;

  rows := COALESCE(v_rows, '[]'::jsonb);
  total_count := v_total_count;
  RETURN NEXT;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_ingredient_overview_paginated(text, int, int, text) IS
  'Paginated ingredient overview with source and search filter; SECURITY INVOKER so RLS applies.';

-- 3) Drop the view so no code runs with definer semantics.
DROP VIEW IF EXISTS public.ingredient_overview_v1;

-- 4) Recreate view as thin wrapper over the function so existing SQL (e.g. find_ingredient_duplicate_candidates) can keep using the name.
--    Note: When this view is queried, execution still runs as view owner. So we update find_ingredient_duplicate_candidates to call get_ingredient_overview_v1() directly and do NOT rely on the view for invoker semantics. We keep the view only for backward compatibility in case other SQL references it; new SQL should use get_ingredient_overview_v1(). Actually - if we leave the view as SELECT * FROM get_ingredient_overview_v1(), then when someone selects from the view, the view owner runs that select, so get_ingredient_overview_v1() is invoked with view owner as current_user (invoker). So the view would still bypass RLS. So we must NOT recreate the view. All callers must use the function.
--    So: no view. Update find_ingredient_duplicate_candidates to use get_ingredient_overview_v1().

-- 5) Update find_ingredient_duplicate_candidates to use get_ingredient_overview_v1() instead of ingredient_overview_v1.
CREATE OR REPLACE FUNCTION public.find_ingredient_duplicate_candidates(
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_min_score float DEFAULT 0.6,
  p_include_disabled boolean DEFAULT false,
  p_include_trgm boolean DEFAULT false
)
RETURNS TABLE(
  nevo_uid text,
  fndds_uid text,
  nevo_name text,
  fndds_name text,
  score float,
  match_method text,
  is_fndds_enabled boolean
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_include_trgm THEN
    RETURN QUERY
    WITH nevo AS (
      SELECT
        v.ingredient_uid,
        v.display_name,
        lower(trim(regexp_replace(v.display_name, '\s+', ' ', 'g'))) AS norm_name
      FROM get_ingredient_overview_v1() v
      WHERE v.source = 'nevo'
        AND v.display_name IS NOT NULL
        AND length(trim(v.display_name)) > 0
    ),
    fndds AS (
      SELECT
        v.ingredient_uid,
        v.display_name,
        v.is_enabled AS is_fndds_enabled,
        lower(trim(regexp_replace(v.display_name, '\s+', ' ', 'g'))) AS norm_name
      FROM get_ingredient_overview_v1() v
      WHERE v.source = 'fndds_survey'
        AND v.display_name IS NOT NULL
        AND length(trim(v.display_name)) > 0
        AND (p_include_disabled OR v.is_enabled)
    ),
    exact_match AS (
      SELECT n.ingredient_uid AS nevo_uid, f.ingredient_uid AS fndds_uid,
        n.display_name AS nevo_name, f.display_name AS fndds_name,
        1.0::float AS score, 'exact'::text AS match_method, f.is_fndds_enabled
      FROM nevo n
      JOIN fndds f ON n.norm_name = f.norm_name
    ),
    contains_match AS (
      SELECT n.ingredient_uid AS nevo_uid, f.ingredient_uid AS fndds_uid,
        n.display_name AS nevo_name, f.display_name AS fndds_name,
        0.85::float AS score, 'contains'::text AS match_method, f.is_fndds_enabled
      FROM nevo n
      JOIN fndds f ON (
        f.norm_name LIKE '%' || n.norm_name || '%'
        OR n.norm_name LIKE '%' || f.norm_name || '%'
      )
      AND n.norm_name <> f.norm_name
    ),
    trgm_match AS (
      SELECT n.ingredient_uid AS nevo_uid, f.ingredient_uid AS fndds_uid,
        n.display_name AS nevo_name, f.display_name AS fndds_name,
        similarity(n.norm_name, f.norm_name) AS score, 'trgm'::text AS match_method, f.is_fndds_enabled
      FROM nevo n
      JOIN fndds f ON similarity(n.norm_name, f.norm_name) >= p_min_score
      AND n.norm_name <> f.norm_name
    ),
    combined AS (
      SELECT * FROM exact_match
      UNION ALL SELECT * FROM contains_match
      UNION ALL SELECT * FROM trgm_match
    ),
    deduped AS (
      SELECT DISTINCT ON (nevo_uid, fndds_uid)
        nevo_uid, fndds_uid, nevo_name, fndds_name, score, match_method, is_fndds_enabled
      FROM combined
      ORDER BY nevo_uid, fndds_uid, score DESC
    )
    SELECT d.nevo_uid, d.fndds_uid, d.nevo_name, d.fndds_name, d.score, d.match_method, d.is_fndds_enabled
    FROM deduped d
    WHERE (
      p_q IS NULL OR p_q = ''
      OR d.nevo_name ILIKE '%' || trim(p_q) || '%'
      OR d.fndds_name ILIKE '%' || trim(p_q) || '%'
    )
    ORDER BY d.score DESC, d.nevo_name ASC
    LIMIT least(greatest(p_limit, 1), 500);
  ELSE
    RETURN QUERY
    WITH nevo AS (
      SELECT
        v.ingredient_uid,
        v.display_name,
        lower(trim(regexp_replace(v.display_name, '\s+', ' ', 'g'))) AS norm_name
      FROM get_ingredient_overview_v1() v
      WHERE v.source = 'nevo'
        AND v.display_name IS NOT NULL
        AND length(trim(v.display_name)) > 0
    ),
    fndds AS (
      SELECT
        v.ingredient_uid,
        v.display_name,
        v.is_enabled AS is_fndds_enabled,
        lower(trim(regexp_replace(v.display_name, '\s+', ' ', 'g'))) AS norm_name
      FROM get_ingredient_overview_v1() v
      WHERE v.source = 'fndds_survey'
        AND v.display_name IS NOT NULL
        AND length(trim(v.display_name)) > 0
        AND (p_include_disabled OR v.is_enabled)
    ),
    exact_match AS (
      SELECT n.ingredient_uid AS nevo_uid, f.ingredient_uid AS fndds_uid,
        n.display_name AS nevo_name, f.display_name AS fndds_name,
        1.0::float AS score, 'exact'::text AS match_method, f.is_fndds_enabled
      FROM nevo n
      JOIN fndds f ON n.norm_name = f.norm_name
    ),
    contains_match AS (
      SELECT n.ingredient_uid AS nevo_uid, f.ingredient_uid AS fndds_uid,
        n.display_name AS nevo_name, f.display_name AS fndds_name,
        0.85::float AS score, 'contains'::text AS match_method, f.is_fndds_enabled
      FROM nevo n
      JOIN fndds f ON (
        f.norm_name LIKE '%' || n.norm_name || '%'
        OR n.norm_name LIKE '%' || f.norm_name || '%'
      )
      AND n.norm_name <> f.norm_name
    ),
    combined AS (
      SELECT * FROM exact_match
      UNION ALL SELECT * FROM contains_match
    ),
    deduped AS (
      SELECT DISTINCT ON (nevo_uid, fndds_uid)
        nevo_uid, fndds_uid, nevo_name, fndds_name, score, match_method, is_fndds_enabled
      FROM combined
      ORDER BY nevo_uid, fndds_uid, score DESC
    )
    SELECT d.nevo_uid, d.fndds_uid, d.nevo_name, d.fndds_name, d.score, d.match_method, d.is_fndds_enabled
    FROM deduped d
    WHERE (
      p_q IS NULL OR p_q = ''
      OR d.nevo_name ILIKE '%' || trim(p_q) || '%'
      OR d.fndds_name ILIKE '%' || trim(p_q) || '%'
    )
    ORDER BY d.score DESC, d.nevo_name ASC
    LIMIT least(greatest(p_limit, 1), 500);
  END IF;
END;
$$;

-- 6) Grants
GRANT EXECUTE ON FUNCTION public.get_ingredient_overview_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ingredient_overview_v1() TO anon;
GRANT EXECUTE ON FUNCTION public.get_ingredient_overview_paginated(text, int, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ingredient_overview_paginated(text, int, int, text) TO anon;
