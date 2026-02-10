-- Migration: Family members and per-member personal settings
-- Description: family_members owned by user; preferences, diet, health, therapeutic per member.
-- Personal settings move from user profile to family module.

-- ============================================================================
-- 1) public.family_members
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.family_members (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_self BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON public.family_members(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_user_is_self
  ON public.family_members(user_id)
  WHERE is_self = true;

COMMENT ON TABLE public.family_members IS 'Family members per user; is_self marks the account owner (e.g. "Ik").';
COMMENT ON COLUMN public.family_members.is_self IS 'At most one per user; used as default for meal planning.';

-- ============================================================================
-- 2) public.family_member_preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.family_member_preferences (
  family_member_id UUID NOT NULL PRIMARY KEY REFERENCES public.family_members(id) ON DELETE CASCADE,
  max_prep_minutes INTEGER NOT NULL DEFAULT 30,
  servings_default INTEGER NOT NULL DEFAULT 1,
  kcal_target INTEGER NULL,
  allergies TEXT[] NOT NULL DEFAULT '{}',
  dislikes TEXT[] NOT NULL DEFAULT '{}',
  variety_window_days INTEGER NOT NULL DEFAULT 7,
  breakfast_preference TEXT[] NOT NULL DEFAULT '{}',
  lunch_preference TEXT[] NOT NULL DEFAULT '{}',
  dinner_preference TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_member_preferences_member_id
  ON public.family_member_preferences(family_member_id);

COMMENT ON TABLE public.family_member_preferences IS 'Personal diet/prep preferences per family member (moved from user_preferences).';

-- ============================================================================
-- 3) public.family_member_diet_profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.family_member_diet_profiles (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE NULL,
  strictness INTEGER NOT NULL DEFAULT 5 CHECK (strictness >= 1 AND strictness <= 10),
  diet_type_id UUID NULL REFERENCES public.diet_types(id) ON DELETE SET NULL,
  is_inflamed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_member_diet_profiles_member_id
  ON public.family_member_diet_profiles(family_member_id);
CREATE INDEX IF NOT EXISTS idx_family_member_diet_profiles_ends_on
  ON public.family_member_diet_profiles(ends_on);
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_member_diet_profiles_member_ends
  ON public.family_member_diet_profiles(family_member_id)
  WHERE ends_on IS NULL;

COMMENT ON TABLE public.family_member_diet_profiles IS 'Diet profile per family member (one active per member, ends_on IS NULL).';

-- ============================================================================
-- 4) public.family_member_health_profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.family_member_health_profiles (
  family_member_id UUID NOT NULL PRIMARY KEY REFERENCES public.family_members(id) ON DELETE CASCADE,
  birth_date DATE NULL,
  sex TEXT NULL CHECK (sex IN ('female', 'male', 'other', 'unknown')),
  height_cm INTEGER NULL CHECK (height_cm BETWEEN 50 AND 250),
  weight_kg NUMERIC NULL CHECK (weight_kg BETWEEN 10 AND 400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_member_health_profiles_member_id
  ON public.family_member_health_profiles(family_member_id);

COMMENT ON TABLE public.family_member_health_profiles IS 'Health/physiology per family member for therapeutic target calculation.';

-- ============================================================================
-- 5) public.family_member_therapeutic_profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.family_member_therapeutic_profiles (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES public.therapeutic_protocols(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  overrides JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_family_member_protocol UNIQUE (family_member_id, protocol_id)
);

CREATE INDEX IF NOT EXISTS idx_family_member_therapeutic_profiles_member_id
  ON public.family_member_therapeutic_profiles(family_member_id);
CREATE INDEX IF NOT EXISTS idx_family_member_therapeutic_profiles_protocol_id
  ON public.family_member_therapeutic_profiles(protocol_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_family_member_therapeutic_one_active_per_member
  ON public.family_member_therapeutic_profiles(family_member_id)
  WHERE is_active = true;

COMMENT ON TABLE public.family_member_therapeutic_profiles IS 'Therapeutic protocol link per family member; at most one active per member.';

-- ============================================================================
-- Triggers: updated_at
-- ============================================================================

DROP TRIGGER IF EXISTS set_updated_at_family_members ON public.family_members;
CREATE TRIGGER set_updated_at_family_members
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_family_member_preferences ON public.family_member_preferences;
CREATE TRIGGER set_updated_at_family_member_preferences
  BEFORE UPDATE ON public.family_member_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_family_member_diet_profiles ON public.family_member_diet_profiles;
CREATE TRIGGER set_updated_at_family_member_diet_profiles
  BEFORE UPDATE ON public.family_member_diet_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_family_member_health_profiles ON public.family_member_health_profiles;
CREATE TRIGGER set_updated_at_family_member_health_profiles
  BEFORE UPDATE ON public.family_member_health_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_family_member_therapeutic_profiles ON public.family_member_therapeutic_profiles;
CREATE TRIGGER set_updated_at_family_member_therapeutic_profiles
  BEFORE UPDATE ON public.family_member_therapeutic_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_member_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_member_diet_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_member_health_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_member_therapeutic_profiles ENABLE ROW LEVEL SECURITY;

-- family_members: user owns their rows
CREATE POLICY "family_members_select_own"
  ON public.family_members FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "family_members_insert_own"
  ON public.family_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "family_members_update_own"
  ON public.family_members FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "family_members_delete_own"
  ON public.family_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- family_member_*: access via owning family_member
CREATE POLICY "family_member_preferences_select_via_owner"
  ON public.family_member_preferences FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_preferences_insert_via_owner"
  ON public.family_member_preferences FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_preferences_update_via_owner"
  ON public.family_member_preferences FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_diet_profiles_select_via_owner"
  ON public.family_member_diet_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_diet_profiles_insert_via_owner"
  ON public.family_member_diet_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_diet_profiles_update_via_owner"
  ON public.family_member_diet_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_diet_profiles_delete_via_owner"
  ON public.family_member_diet_profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_health_profiles_select_via_owner"
  ON public.family_member_health_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_health_profiles_insert_via_owner"
  ON public.family_member_health_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_health_profiles_update_via_owner"
  ON public.family_member_health_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_therapeutic_profiles_select_via_owner"
  ON public.family_member_therapeutic_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_therapeutic_profiles_insert_via_owner"
  ON public.family_member_therapeutic_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_therapeutic_profiles_update_via_owner"
  ON public.family_member_therapeutic_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );

CREATE POLICY "family_member_therapeutic_profiles_delete_via_owner"
  ON public.family_member_therapeutic_profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.family_members fm WHERE fm.id = family_member_id AND fm.user_id = auth.uid())
  );
