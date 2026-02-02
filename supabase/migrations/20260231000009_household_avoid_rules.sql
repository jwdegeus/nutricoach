-- Migration: Household allergen/avoid rules (minimaal)
-- Description: Allergieën/te vermijden ingrediënten per huishouden voor weekmenu-generator.
-- Out of scope: member-level rules, UI, generator-wijzigingen, migratie profiel-allergieën.

-- ============================================================================
-- Table: household_avoid_rules
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.household_avoid_rules (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('allergen', 'avoid', 'warning')),
  match_mode TEXT NOT NULL CHECK (match_mode IN ('nevo_code', 'term')),
  match_value TEXT NOT NULL,
  strictness TEXT NOT NULL DEFAULT 'hard' CHECK (strictness IN ('hard', 'soft')),
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_household_avoid_rules_household_id
  ON public.household_avoid_rules(household_id);

CREATE INDEX IF NOT EXISTS idx_household_avoid_rules_household_rule_type
  ON public.household_avoid_rules(household_id, rule_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_household_avoid_rules_household_match
  ON public.household_avoid_rules(household_id, match_mode, match_value);

COMMENT ON TABLE public.household_avoid_rules IS 'Allergieën/te vermijden ingrediënten per huishouden; weekmenu respecteert hard rules.';
COMMENT ON COLUMN public.household_avoid_rules.rule_type IS 'allergen | avoid | warning';
COMMENT ON COLUMN public.household_avoid_rules.match_mode IS 'nevo_code = NEVO-code; term = vrije tekst (bv. pinda)';
COMMENT ON COLUMN public.household_avoid_rules.match_value IS 'Exact: NEVO-code string of term. Case-normalization later.';
COMMENT ON COLUMN public.household_avoid_rules.strictness IS 'hard = uitsluiten; soft = waarschuwing';

-- ============================================================================
-- Trigger (hergebruik handle_updated_at)
-- ============================================================================

CREATE TRIGGER set_updated_at_household_avoid_rules
  BEFORE UPDATE ON public.household_avoid_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS (owner-scoped via EXISTS op households)
-- ============================================================================

ALTER TABLE public.household_avoid_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household_avoid_rules_select_via_household"
  ON public.household_avoid_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_avoid_rules.household_id
        AND h.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "household_avoid_rules_insert_via_household"
  ON public.household_avoid_rules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_id
        AND h.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "household_avoid_rules_update_via_household"
  ON public.household_avoid_rules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_avoid_rules.household_id
        AND h.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_id
        AND h.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "household_avoid_rules_delete_via_household"
  ON public.household_avoid_rules FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_avoid_rules.household_id
        AND h.owner_user_id = auth.uid()
    )
  );

-- ============================================================================
-- Verificatiequeries (als commentaar)
-- ============================================================================
-- SELECT r.id, r.household_id, r.rule_type, r.match_mode, r.match_value, r.strictness
--   FROM public.household_avoid_rules r
--   JOIN public.households h ON h.id = r.household_id
--   WHERE h.owner_user_id = auth.uid();
