-- Migration: ADH reference values for therapeutic target calculator (admin config).
-- No hardcoded nutrient lists or ADH tables in code; all reference values from this table.
-- Used to compute absolute targets from adh_percent targets in buildTherapeuticTargetsSnapshot.

-- ============================================================================
-- public.therapeutic_adh_reference_values
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.therapeutic_adh_reference_values (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  sex TEXT NULL CHECK (sex IN ('female', 'male', 'other', 'unknown')),
  age_min_years INT NULL,
  age_max_years INT NULL,
  unit TEXT NOT NULL,
  value_num NUMERIC NOT NULL CHECK (value_num >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_therapeutic_adh_ref_unique
  ON public.therapeutic_adh_reference_values(key, sex, age_min_years, age_max_years);

CREATE INDEX IF NOT EXISTS idx_therapeutic_adh_ref_key_active
  ON public.therapeutic_adh_reference_values(key, is_active);

COMMENT ON TABLE public.therapeutic_adh_reference_values IS 'Admin-managed ADH reference values for %ADH → absolute target calculation. key e.g. vitamin_d, magnesium, energy.';

-- ============================================================================
-- Trigger: updated_at
-- ============================================================================

DROP TRIGGER IF EXISTS set_updated_at_therapeutic_adh_reference_values ON public.therapeutic_adh_reference_values;
CREATE TRIGGER set_updated_at_therapeutic_adh_reference_values
  BEFORE UPDATE ON public.therapeutic_adh_reference_values
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.therapeutic_adh_reference_values ENABLE ROW LEVEL SECURITY;

-- Authenticated: SELECT only is_active = true
CREATE POLICY "therapeutic_adh_reference_values_select_active"
  ON public.therapeutic_adh_reference_values FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins: full CRUD (same pattern as other therapeutic tables)
CREATE POLICY "therapeutic_adh_reference_values_admin_all"
  ON public.therapeutic_adh_reference_values FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
