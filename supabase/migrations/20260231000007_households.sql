-- Migration: Households + household_members (basis)
-- Description: Fundament voor allergieën/voorkeuren per gezin. Koppeling user → household via user_preferences.
-- Out of scope: allergieën-tabellen, UI, auto-provisioning, multi-user households.

-- ============================================================================
-- Table: households
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.households (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Mijn huishouden',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_households_owner_user_id ON public.households(owner_user_id);

COMMENT ON TABLE public.households IS 'Huishouden; eigenaar is de enige beheerder (single-owner).';
COMMENT ON COLUMN public.households.owner_user_id IS 'Gebruiker die het huishouden beheert.';

-- ============================================================================
-- Table: household_members
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.household_members (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_year INTEGER NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_household_members_household_id ON public.household_members(household_id);

-- Max 1 primary member per household
CREATE UNIQUE INDEX IF NOT EXISTS idx_household_members_one_primary_per_household
  ON public.household_members(household_id)
  WHERE is_primary = true;

COMMENT ON TABLE public.household_members IS 'Gezinsleden; later portie-factor/allergieën per lid.';
COMMENT ON COLUMN public.household_members.birth_year IS 'Optioneel geboortejaar voor portie-factor; geen gevoelige details.';
COMMENT ON COLUMN public.household_members.is_primary IS 'Maximaal één primary per huishouden (de planner/owner).';

-- ============================================================================
-- Koppeling user_preferences → household
-- ============================================================================

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS household_id UUID NULL REFERENCES public.households(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_preferences_household_id ON public.user_preferences(household_id);

COMMENT ON COLUMN public.user_preferences.household_id IS 'Optioneel huishouden; later bij signup auto-provisioning.';

-- ============================================================================
-- Triggers (hergebruik bestaand handle_updated_at)
-- ============================================================================

CREATE TRIGGER set_updated_at_households
  BEFORE UPDATE ON public.households
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_household_members
  BEFORE UPDATE ON public.household_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

-- households: alleen owner mag alles
CREATE POLICY "households_select_owner"
  ON public.households FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "households_insert_owner"
  ON public.households FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "households_update_owner"
  ON public.households FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "households_delete_owner"
  ON public.households FOR DELETE
  USING (owner_user_id = auth.uid());

-- household_members: alleen via household waar owner_user_id = auth.uid()
CREATE POLICY "household_members_select_via_household"
  ON public.household_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_members.household_id
        AND h.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "household_members_insert_via_household"
  ON public.household_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_id
        AND h.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "household_members_update_via_household"
  ON public.household_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_members.household_id
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

CREATE POLICY "household_members_delete_via_household"
  ON public.household_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = household_members.household_id
        AND h.owner_user_id = auth.uid()
    )
  );

-- ============================================================================
-- Verificatiequeries (uitvoeren als service_role of als ingelogde owner)
-- ============================================================================
-- SELECT id, owner_user_id, name FROM public.households WHERE owner_user_id = auth.uid();
-- SELECT m.id, m.household_id, m.name, m.is_primary FROM public.household_members m
--   JOIN public.households h ON h.id = m.household_id WHERE h.owner_user_id = auth.uid();
-- SELECT user_id, household_id FROM public.user_preferences WHERE user_id = auth.uid();
