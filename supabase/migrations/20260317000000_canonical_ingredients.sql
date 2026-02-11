-- Migration: Canonical ingredient identity + external refs (provenance)
-- Description: One canonical ingredient table used across recipes, pantry and shopping;
--   external refs (nevo/fdc/custom/ai) are provenance only, not app identity.
--   Introduced as canonical_ingredients (not "ingredients") to avoid collision with
--   existing recipe_ingredients (per-recipe rows) and custom_foods/nevo_foods.

-- ============================================================================
-- Table: canonical_ingredients
-- ============================================================================
-- Canonical ingredient identity used across recipes, pantry and shopping;
-- external refs are provenance only (see ingredient_external_refs).

CREATE TABLE IF NOT EXISTS public.canonical_ingredients (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT canonical_ingredients_slug_unique UNIQUE (slug)
);

COMMENT ON COLUMN public.canonical_ingredients.slug IS 'Deterministic normalisation of name for dedupe/lookup (e.g. lowercased, trimmed).';

CREATE INDEX IF NOT EXISTS idx_canonical_ingredients_slug
  ON public.canonical_ingredients (slug);

CREATE INDEX IF NOT EXISTS idx_canonical_ingredients_name
  ON public.canonical_ingredients (name);

COMMENT ON TABLE public.canonical_ingredients IS 'Canonical ingredient identity used across recipes, pantry and shopping; external refs are provenance only.';

-- ============================================================================
-- Table: ingredient_external_refs
-- ============================================================================
-- Maps external source IDs (nevo_code, fdc_id, custom_food_id, ai id) to
-- canonical_ingredients; for provenance only. App identity is canonical_ingredients.id.

CREATE TABLE IF NOT EXISTS public.ingredient_external_refs (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES public.canonical_ingredients(id) ON DELETE CASCADE,
  ref_type TEXT NOT NULL,
  ref_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredient_external_refs_type_check
    CHECK (ref_type IN ('nevo', 'fdc', 'custom', 'ai')),
  CONSTRAINT ingredient_external_refs_type_value_unique
    UNIQUE (ref_type, ref_value)
);

CREATE INDEX IF NOT EXISTS idx_ingredient_external_refs_ingredient_id
  ON public.ingredient_external_refs (ingredient_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_external_refs_type_value
  ON public.ingredient_external_refs (ref_type, ref_value);

COMMENT ON TABLE public.ingredient_external_refs IS 'Canonical ingredient identity used across recipes, pantry and shopping; external refs are provenance only.';

-- ============================================================================
-- Trigger: updated_at (canonical_ingredients)
-- ============================================================================

CREATE TRIGGER set_updated_at_canonical_ingredients
  BEFORE UPDATE ON public.canonical_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS: canonical_ingredients
-- ============================================================================

ALTER TABLE public.canonical_ingredients ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users (needed for recipes, pantry, shopping)
CREATE POLICY "canonical_ingredients_select_authenticated"
  ON public.canonical_ingredients
  FOR SELECT
  TO authenticated
  USING (true);

-- Write: admin only (population/maint via server or admin UI)
CREATE POLICY "canonical_ingredients_insert_admin"
  ON public.canonical_ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "canonical_ingredients_update_admin"
  ON public.canonical_ingredients
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "canonical_ingredients_delete_admin"
  ON public.canonical_ingredients
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- RLS: ingredient_external_refs
-- ============================================================================

ALTER TABLE public.ingredient_external_refs ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users
CREATE POLICY "ingredient_external_refs_select_authenticated"
  ON public.ingredient_external_refs
  FOR SELECT
  TO authenticated
  USING (true);

-- Write: admin only
CREATE POLICY "ingredient_external_refs_insert_admin"
  ON public.ingredient_external_refs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "ingredient_external_refs_update_admin"
  ON public.ingredient_external_refs
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "ingredient_external_refs_delete_admin"
  ON public.ingredient_external_refs
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
