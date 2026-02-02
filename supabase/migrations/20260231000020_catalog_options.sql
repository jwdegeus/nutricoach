-- Migration: catalog_options (system + user) for cuisine & protein_type
-- Description: Generic options catalog for dimensions (cuisine, protein_type).
--              System options are predefined; users can add custom options per dimension.
-- Security: RLS-first; no SELECT *; minimal columns.
-- Out of scope: Admin UI for system options; custom_meals FK or UI filter changes.

-- ============================================================================
-- Table: catalog_options
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.catalog_options (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension TEXT NOT NULL CHECK (dimension IN ('cuisine', 'protein_type')),
  scope TEXT NOT NULL CHECK (scope IN ('system', 'user')),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NULL,
  label TEXT NOT NULL CHECK (btrim(label) <> ''),
  label_norm TEXT GENERATED ALWAYS AS (lower(btrim(label))) STORED,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_options_scope_system CHECK (
    (scope = 'system' AND user_id IS NULL AND key IS NOT NULL)
    OR (scope = 'user' AND user_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.catalog_options IS 'Options catalog: system-defined and user-defined values for dimensions (cuisine, protein_type).';
COMMENT ON COLUMN public.catalog_options.dimension IS 'Facet: cuisine | protein_type (extensible via new CHECK values).';
COMMENT ON COLUMN public.catalog_options.scope IS 'system = NutriCoach predefined; user = custom per user.';
COMMENT ON COLUMN public.catalog_options.key IS 'Stable key for system options; NULL for user options.';
COMMENT ON COLUMN public.catalog_options.label IS 'Display label; must be non-empty after trim.';
COMMENT ON COLUMN public.catalog_options.label_norm IS 'Normalized label for uniqueness: lower(btrim(label)).';

-- Uniqueness: system by (dimension, key); user by (dimension, user_id, label_norm)
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_options_system_unique
  ON public.catalog_options(dimension, key)
  WHERE scope = 'system';

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_options_user_unique
  ON public.catalog_options(dimension, user_id, label_norm)
  WHERE scope = 'user';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_catalog_options_dimension_scope_active_sort
  ON public.catalog_options(dimension, scope, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_catalog_options_user_dimension
  ON public.catalog_options(user_id, dimension)
  WHERE scope = 'user';

-- ============================================================================
-- Trigger: updated_at
-- ============================================================================
CREATE TRIGGER set_updated_at_catalog_options
  BEFORE UPDATE ON public.catalog_options
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.catalog_options ENABLE ROW LEVEL SECURITY;

-- SELECT: system options for everyone; user options only for owner
CREATE POLICY "catalog_options_select"
  ON public.catalog_options
  FOR SELECT
  USING (
    scope = 'system'
    OR (scope = 'user' AND user_id = auth.uid())
  );

-- INSERT: only user-scoped rows for own user_id
CREATE POLICY "catalog_options_insert"
  ON public.catalog_options
  FOR INSERT
  WITH CHECK (scope = 'user' AND user_id = auth.uid());

-- UPDATE: only user-scoped rows owned by current user
CREATE POLICY "catalog_options_update"
  ON public.catalog_options
  FOR UPDATE
  USING (scope = 'user' AND user_id = auth.uid())
  WITH CHECK (scope = 'user' AND user_id = auth.uid());

-- DELETE: only user-scoped rows owned by current user
CREATE POLICY "catalog_options_delete"
  ON public.catalog_options
  FOR DELETE
  USING (scope = 'user' AND user_id = auth.uid());

-- ============================================================================
-- Seed: system options for cuisine and protein_type
-- ============================================================================
INSERT INTO public.catalog_options (dimension, scope, key, label, sort_order)
VALUES
  ('cuisine', 'system', 'italian', 'Italian', 10),
  ('cuisine', 'system', 'mexican', 'Mexican', 20),
  ('cuisine', 'system', 'asian', 'Asian', 30),
  ('cuisine', 'system', 'dutch', 'Dutch', 40),
  ('cuisine', 'system', 'mediterranean', 'Mediterranean', 50),
  ('protein_type', 'system', 'chicken', 'Chicken', 10),
  ('protein_type', 'system', 'beef', 'Beef', 20),
  ('protein_type', 'system', 'fish', 'Fish', 30),
  ('protein_type', 'system', 'eggs', 'Eggs', 40),
  ('protein_type', 'system', 'vegetarian', 'Vegetarian', 50),
  ('protein_type', 'system', 'vegan', 'Vegan', 60)
ON CONFLICT (dimension, key) WHERE (scope = 'system') DO NOTHING;

-- ============================================================================
-- Validatie (voorbeeldqueries in comments – geen SELECT *)
-- ============================================================================
-- Alle actieve system + eigen user opties voor een dimension:
--   SELECT id, dimension, scope, key, label, is_active, sort_order
--   FROM public.catalog_options
--   WHERE dimension = 'cuisine' AND is_active = true
--     AND (scope = 'system' OR (scope = 'user' AND user_id = auth.uid()))
--   ORDER BY scope DESC, sort_order, label;
--
-- Alleen system opties voor protein_type:
--   SELECT id, dimension, key, label, sort_order
--   FROM public.catalog_options
--   WHERE dimension = 'protein_type' AND scope = 'system' AND is_active = true
--   ORDER BY sort_order;
--
-- User optie toevoegen (cuisine):
--   INSERT INTO public.catalog_options (dimension, scope, user_id, label, sort_order)
--   VALUES ('cuisine', 'user', auth.uid(), 'Fusion', 100);
--
-- User optie bijwerken:
--   UPDATE public.catalog_options
--   SET label = 'Asian Fusion', sort_order = 90, updated_at = NOW()
--   WHERE id = '.<id>.' AND scope = 'user' AND user_id = auth.uid();
--
-- User optie verwijderen:
--   DELETE FROM public.catalog_options
--   WHERE id = '.<id>.' AND scope = 'user' AND user_id = auth.uid();
--
-- Constraints: scope=system → user_id NULL, key NOT NULL; scope=user → user_id NOT NULL.
-- Uniqueness: system (dimension, key); user (dimension, user_id, label_norm).
