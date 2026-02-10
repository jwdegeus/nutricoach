-- Migration: Therapeutic Supplement Rules (voorwaarden/warnings/contra-indicaties per supplement)
-- Description: DB-driven rules layer for supplement guidance; admins manage rules per protocol+supplement.
-- No seed data; no hardcoded rule keys. RLS: authenticated read when rule+protocol+supplement active; admins full CRUD.

-- ============================================================================
-- 1) Table + constraints + FKs + unique + checks
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.therapeutic_protocol_supplement_rules (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES public.therapeutic_protocols(id) ON DELETE CASCADE,
  supplement_key TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('warning', 'condition', 'contraindication')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'error')),
  when_json JSONB NULL,
  message_nl TEXT NOT NULL CHECK (length(message_nl) BETWEEN 5 AND 400),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_protocol_supplement_rule UNIQUE (protocol_id, supplement_key, rule_key),
  CONSTRAINT fk_supplement_rules_supplement
    FOREIGN KEY (protocol_id, supplement_key)
    REFERENCES public.therapeutic_protocol_supplements(protocol_id, supplement_key)
    ON DELETE CASCADE
);

COMMENT ON TABLE public.therapeutic_protocol_supplement_rules IS 'Rules (warnings/conditions/contraindications) per protocol supplement; admin-managed, no hardcoded keys.';
COMMENT ON COLUMN public.therapeutic_protocol_supplement_rules.rule_key IS 'Admin-managed identifier for the rule; no fixed list.';
COMMENT ON COLUMN public.therapeutic_protocol_supplement_rules.when_json IS 'Expression data for when the rule applies; no code execution.';

-- ============================================================================
-- 2) Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_therapeutic_supplement_rules_protocol_id
  ON public.therapeutic_protocol_supplement_rules(protocol_id);

CREATE INDEX IF NOT EXISTS idx_therapeutic_supplement_rules_protocol_supplement
  ON public.therapeutic_protocol_supplement_rules(protocol_id, supplement_key);

CREATE INDEX IF NOT EXISTS idx_therapeutic_supplement_rules_is_active
  ON public.therapeutic_protocol_supplement_rules(is_active);

CREATE INDEX IF NOT EXISTS idx_therapeutic_supplement_rules_kind
  ON public.therapeutic_protocol_supplement_rules(kind);

CREATE INDEX IF NOT EXISTS idx_therapeutic_supplement_rules_severity
  ON public.therapeutic_protocol_supplement_rules(severity);

-- ============================================================================
-- 3) Trigger: updated_at
-- ============================================================================

DROP TRIGGER IF EXISTS set_updated_at_therapeutic_protocol_supplement_rules
  ON public.therapeutic_protocol_supplement_rules;
CREATE TRIGGER set_updated_at_therapeutic_protocol_supplement_rules
  BEFORE UPDATE ON public.therapeutic_protocol_supplement_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 4) RLS
-- ============================================================================

ALTER TABLE public.therapeutic_protocol_supplement_rules ENABLE ROW LEVEL SECURITY;

-- Policy 1: authenticated read when rule + protocol + supplement are active
DROP POLICY IF EXISTS "therapeutic_protocol_supplement_rules_select_active"
  ON public.therapeutic_protocol_supplement_rules;
CREATE POLICY "therapeutic_protocol_supplement_rules_select_active"
  ON public.therapeutic_protocol_supplement_rules
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.therapeutic_protocols p
      WHERE p.id = therapeutic_protocol_supplement_rules.protocol_id
        AND p.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.therapeutic_protocol_supplements s
      WHERE s.protocol_id = therapeutic_protocol_supplement_rules.protocol_id
        AND s.supplement_key = therapeutic_protocol_supplement_rules.supplement_key
        AND s.is_active = true
    )
  );

-- Policy 2: admins full CRUD
DROP POLICY IF EXISTS "therapeutic_protocol_supplement_rules_admin_all"
  ON public.therapeutic_protocol_supplement_rules;
CREATE POLICY "therapeutic_protocol_supplement_rules_admin_all"
  ON public.therapeutic_protocol_supplement_rules
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
