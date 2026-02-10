-- Migration: when_json snippets for therapeutic supplement rules (admin-managed templates).
-- No business data in code; snippets loaded from DB. Used in Admin rule modal "Insert template".

-- ============================================================================
-- public.therapeutic_when_json_snippets
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.therapeutic_when_json_snippets (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_key TEXT NOT NULL,
  label_nl TEXT NOT NULL,
  description_nl TEXT NULL,
  template_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_label_nl_len CHECK (char_length(label_nl) >= 2 AND char_length(label_nl) <= 80),
  CONSTRAINT chk_description_nl_len CHECK (description_nl IS NULL OR char_length(description_nl) <= 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_therapeutic_when_json_snippets_snippet_key
  ON public.therapeutic_when_json_snippets(snippet_key);
CREATE INDEX IF NOT EXISTS idx_therapeutic_when_json_snippets_is_active
  ON public.therapeutic_when_json_snippets(is_active);

COMMENT ON TABLE public.therapeutic_when_json_snippets IS 'Admin-managed when_json templates for supplement rules; no hardcoded snippets in code.';

-- ============================================================================
-- Trigger: updated_at
-- ============================================================================

DROP TRIGGER IF EXISTS set_updated_at_therapeutic_when_json_snippets ON public.therapeutic_when_json_snippets;
CREATE TRIGGER set_updated_at_therapeutic_when_json_snippets
  BEFORE UPDATE ON public.therapeutic_when_json_snippets
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.therapeutic_when_json_snippets ENABLE ROW LEVEL SECURITY;

-- Authenticated: SELECT only is_active = true
CREATE POLICY "therapeutic_when_json_snippets_select_active"
  ON public.therapeutic_when_json_snippets FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins: full CRUD
CREATE POLICY "therapeutic_when_json_snippets_admin_all"
  ON public.therapeutic_when_json_snippets FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
