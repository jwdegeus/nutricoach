-- Enable pg_trgm for trigram similarity (NEVO ↔ FNDDS duplicate candidates).
-- RPC: find_ingredient_duplicate_candidates (read-only, uses ingredient_overview_v1).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Returns NEVO ↔ FNDDS duplicate candidates: exact, contains, and trigram matches.
-- Deduped by (nevo_uid, fndds_uid) keeping highest score; sorted by score desc, nevo_name asc.
CREATE OR REPLACE FUNCTION public.find_ingredient_duplicate_candidates(
  p_q text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_min_score float DEFAULT 0.6,
  p_include_disabled boolean DEFAULT false
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
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH nevo AS (
    SELECT
      v.ingredient_uid,
      v.display_name,
      lower(trim(regexp_replace(v.display_name, '\s+', ' ', 'g'))) AS norm_name
    FROM ingredient_overview_v1 v
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
    FROM ingredient_overview_v1 v
    WHERE v.source = 'fndds_survey'
      AND v.display_name IS NOT NULL
      AND length(trim(v.display_name)) > 0
      AND (p_include_disabled OR v.is_enabled)
  ),
  exact_match AS (
    SELECT
      n.ingredient_uid AS nevo_uid,
      f.ingredient_uid AS fndds_uid,
      n.display_name AS nevo_name,
      f.display_name AS fndds_name,
      1.0::float AS score,
      'exact'::text AS match_method,
      f.is_fndds_enabled
    FROM nevo n
    JOIN fndds f ON n.norm_name = f.norm_name
  ),
  contains_match AS (
    SELECT
      n.ingredient_uid AS nevo_uid,
      f.ingredient_uid AS fndds_uid,
      n.display_name AS nevo_name,
      f.display_name AS fndds_name,
      0.85::float AS score,
      'contains'::text AS match_method,
      f.is_fndds_enabled
    FROM nevo n
    JOIN fndds f ON (
      f.norm_name LIKE '%' || n.norm_name || '%'
      OR n.norm_name LIKE '%' || f.norm_name || '%'
    )
    AND n.norm_name <> f.norm_name
  ),
  trgm_match AS (
    SELECT
      n.ingredient_uid AS nevo_uid,
      f.ingredient_uid AS fndds_uid,
      n.display_name AS nevo_name,
      f.display_name AS fndds_name,
      similarity(n.norm_name, f.norm_name) AS score,
      'trgm'::text AS match_method,
      f.is_fndds_enabled
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
      nevo_uid,
      fndds_uid,
      nevo_name,
      fndds_name,
      score,
      match_method,
      is_fndds_enabled
    FROM combined
    ORDER BY nevo_uid, fndds_uid, score DESC
  )
  SELECT
    d.nevo_uid,
    d.fndds_uid,
    d.nevo_name,
    d.fndds_name,
    d.score,
    d.match_method,
    d.is_fndds_enabled
  FROM deduped d
  WHERE (
    p_q IS NULL
    OR p_q = ''
    OR d.nevo_name ILIKE '%' || trim(p_q) || '%'
    OR d.fndds_name ILIKE '%' || trim(p_q) || '%'
  )
  ORDER BY d.score DESC, d.nevo_name ASC
  LIMIT least(greatest(p_limit, 1), 500);
$$;

COMMENT ON FUNCTION public.find_ingredient_duplicate_candidates(text, int, float, boolean) IS
  'Returns NEVO ↔ FNDDS duplicate candidates (exact, contains, trigram). Read-only; uses ingredient_overview_v1.';

GRANT EXECUTE ON FUNCTION public.find_ingredient_duplicate_candidates(text, int, float, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_ingredient_duplicate_candidates(text, int, float, boolean) TO anon;
