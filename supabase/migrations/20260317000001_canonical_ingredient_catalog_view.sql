-- Migration: Canonical ingredient catalog view (read-only)
-- Description: Unified read-only catalog for canonical ingredient identity + provenance refs;
--   used for search/inspection and later app refactors. One place to look for identity + refs.
--   RLS on underlying tables (canonical_ingredients, ingredient_external_refs) applies;
--   no security definer. Grant SELECT to authenticated so app can read (same pattern as
--   ingredient_overview_v1); public schema default grants already allow role usage.

-- ============================================================================
-- View: canonical_ingredient_catalog_v1
-- ============================================================================

CREATE OR REPLACE VIEW public.canonical_ingredient_catalog_v1 AS
SELECT
  c.id AS ingredient_id,
  c.name,
  c.slug,
  r.ref_type,
  r.ref_value,
  c.created_at,
  c.updated_at
FROM public.canonical_ingredients c
LEFT JOIN public.ingredient_external_refs r ON r.ingredient_id = c.id;

COMMENT ON VIEW public.canonical_ingredient_catalog_v1 IS 'Unified read-only catalog for canonical ingredient identity + provenance refs; used for search/inspection and later app refactors.';

-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT ON public.canonical_ingredient_catalog_v1 TO authenticated;
