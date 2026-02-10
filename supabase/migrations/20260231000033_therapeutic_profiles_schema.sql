-- Migration: Therapeutic Profiles (protocols, targets, supplements, user health & protocol link)
-- Description: Admin-managed protocols + targets/supplements; user health profile and user↔protocol link.
-- No UI, no calculator, no meal_plan snapshot changes. RLS: users own health/profile; admins full CRUD; non-admins read active protocols only.

-- ============================================================================
-- 1) public.therapeutic_protocols (admin)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.therapeutic_protocols (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_key TEXT NOT NULL,
  name_nl TEXT NOT NULL,
  description_nl TEXT NULL,
  version TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_refs JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_therapeutic_protocols_protocol_key
  ON public.therapeutic_protocols(protocol_key);
CREATE INDEX IF NOT EXISTS idx_therapeutic_protocols_is_active
  ON public.therapeutic_protocols(is_active);

COMMENT ON TABLE public.therapeutic_protocols IS 'Admin-defined therapeutic protocols (e.g. MS v1).';
COMMENT ON COLUMN public.therapeutic_protocols.source_refs IS 'Lightweight refs: [{ title, url? }].';

-- ============================================================================
-- 2) public.therapeutic_protocol_targets (admin)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.therapeutic_protocol_targets (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES public.therapeutic_protocols(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly')),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('macro', 'micro', 'food_group', 'variety', 'frequency')),
  target_key TEXT NOT NULL,
  value_num NUMERIC NOT NULL,
  unit TEXT NULL,
  value_type TEXT NOT NULL DEFAULT 'absolute' CHECK (value_type IN ('absolute', 'adh_percent', 'count')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_value_num_non_negative CHECK (value_num >= 0),
  CONSTRAINT chk_adh_percent_unit CHECK (
    (value_type = 'adh_percent' AND unit = '%_adh') OR (value_type <> 'adh_percent')
  ),
  CONSTRAINT chk_count_unit_null CHECK (
    (value_type = 'count' AND unit IS NULL) OR (value_type <> 'count')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_therapeutic_protocol_targets_protocol_period_kind_key
  ON public.therapeutic_protocol_targets(protocol_id, period, target_kind, target_key);
CREATE INDEX IF NOT EXISTS idx_therapeutic_protocol_targets_protocol_id
  ON public.therapeutic_protocol_targets(protocol_id);
CREATE INDEX IF NOT EXISTS idx_therapeutic_protocol_targets_period_kind
  ON public.therapeutic_protocol_targets(period, target_kind);

COMMENT ON TABLE public.therapeutic_protocol_targets IS 'Daily/weekly targets per protocol (macro, micro, food_group, variety, frequency).';

-- ============================================================================
-- 3) public.therapeutic_protocol_supplements (admin)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.therapeutic_protocol_supplements (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES public.therapeutic_protocols(id) ON DELETE CASCADE,
  supplement_key TEXT NOT NULL,
  label_nl TEXT NOT NULL,
  dosage_text TEXT NULL,
  notes_nl TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_protocol_supplement UNIQUE (protocol_id, supplement_key)
);

CREATE INDEX IF NOT EXISTS idx_therapeutic_protocol_supplements_protocol_id
  ON public.therapeutic_protocol_supplements(protocol_id);
CREATE INDEX IF NOT EXISTS idx_therapeutic_protocol_supplements_is_active
  ON public.therapeutic_protocol_supplements(is_active);

COMMENT ON TABLE public.therapeutic_protocol_supplements IS 'Supplements per protocol (free-text dosage v1).';

-- ============================================================================
-- 4) public.user_health_profiles (user-owned)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_health_profiles (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_date DATE NULL,
  sex TEXT NULL CHECK (sex IN ('female', 'male', 'other', 'unknown')),
  height_cm INTEGER NULL CHECK (height_cm BETWEEN 50 AND 250),
  weight_kg NUMERIC NULL CHECK (weight_kg BETWEEN 10 AND 400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_health_profiles IS 'User physiology for target calculation (birth date, sex, height, weight).';

-- ============================================================================
-- 5) public.user_therapeutic_profiles (user-owned)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_therapeutic_profiles (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES public.therapeutic_protocols(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  overrides JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_protocol UNIQUE (user_id, protocol_id)
);

CREATE INDEX IF NOT EXISTS idx_user_therapeutic_profiles_user_id
  ON public.user_therapeutic_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_therapeutic_profiles_protocol_id
  ON public.user_therapeutic_profiles(protocol_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_therapeutic_profiles_one_active_per_user
  ON public.user_therapeutic_profiles(user_id)
  WHERE is_active = true;

COMMENT ON TABLE public.user_therapeutic_profiles IS 'User↔protocol link; at most one active profile per user. overrides reserved for per-target overrides.';

-- ============================================================================
-- Triggers: updated_at (public.handle_updated_at)
-- ============================================================================

DROP TRIGGER IF EXISTS set_updated_at_therapeutic_protocols ON public.therapeutic_protocols;
CREATE TRIGGER set_updated_at_therapeutic_protocols
  BEFORE UPDATE ON public.therapeutic_protocols
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_therapeutic_protocol_targets ON public.therapeutic_protocol_targets;
CREATE TRIGGER set_updated_at_therapeutic_protocol_targets
  BEFORE UPDATE ON public.therapeutic_protocol_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_therapeutic_protocol_supplements ON public.therapeutic_protocol_supplements;
CREATE TRIGGER set_updated_at_therapeutic_protocol_supplements
  BEFORE UPDATE ON public.therapeutic_protocol_supplements
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_user_health_profiles ON public.user_health_profiles;
CREATE TRIGGER set_updated_at_user_health_profiles
  BEFORE UPDATE ON public.user_health_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_user_therapeutic_profiles ON public.user_therapeutic_profiles;
CREATE TRIGGER set_updated_at_user_therapeutic_profiles
  BEFORE UPDATE ON public.user_therapeutic_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.therapeutic_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapeutic_protocol_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapeutic_protocol_supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_health_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_therapeutic_profiles ENABLE ROW LEVEL SECURITY;

-- 1) therapeutic_protocols: authenticated SELECT active only; admins full CRUD
CREATE POLICY "therapeutic_protocols_select_active"
  ON public.therapeutic_protocols FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "therapeutic_protocols_admin_all"
  ON public.therapeutic_protocols FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2) therapeutic_protocol_targets: authenticated SELECT via active protocol; admins full CRUD
CREATE POLICY "therapeutic_protocol_targets_select_via_active_protocol"
  ON public.therapeutic_protocol_targets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.therapeutic_protocols p
      WHERE p.id = therapeutic_protocol_targets.protocol_id
        AND p.is_active = true
    )
  );

CREATE POLICY "therapeutic_protocol_targets_admin_all"
  ON public.therapeutic_protocol_targets FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3) therapeutic_protocol_supplements: authenticated SELECT active supplements via active protocol; admins full CRUD
CREATE POLICY "therapeutic_protocol_supplements_select_active_via_protocol"
  ON public.therapeutic_protocol_supplements FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.therapeutic_protocols p
      WHERE p.id = therapeutic_protocol_supplements.protocol_id
        AND p.is_active = true
    )
  );

CREATE POLICY "therapeutic_protocol_supplements_admin_all"
  ON public.therapeutic_protocol_supplements FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4) user_health_profiles: user own row SELECT/INSERT/UPDATE; admins SELECT all
CREATE POLICY "user_health_profiles_select_own"
  ON public.user_health_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_health_profiles_insert_own"
  ON public.user_health_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_health_profiles_update_own"
  ON public.user_health_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_health_profiles_admin_select"
  ON public.user_health_profiles FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 5) user_therapeutic_profiles: user own rows SELECT/INSERT/UPDATE; admins SELECT all
CREATE POLICY "user_therapeutic_profiles_select_own"
  ON public.user_therapeutic_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_therapeutic_profiles_insert_own"
  ON public.user_therapeutic_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_therapeutic_profiles_update_own"
  ON public.user_therapeutic_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_therapeutic_profiles_admin_select"
  ON public.user_therapeutic_profiles FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- Optional seed (no medical content; example protocol row only)
-- ============================================================================

INSERT INTO public.therapeutic_protocols (protocol_key, name_nl, is_active)
VALUES ('ms_v1', 'Multiple sclerose (v1)', false)
ON CONFLICT (protocol_key) DO NOTHING;
