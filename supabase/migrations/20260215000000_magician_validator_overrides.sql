-- Migration: magician_validator_overrides
-- Description: Tabel voor false-positive uitsluitingen en uitzonderingen in de AI Magician.
-- Vervangt hardcoded SUBSTRING_FALSE_POSITIVE_IF_CONTAINS en soortgelijke regels in diet-validator.ts

CREATE TABLE IF NOT EXISTS public.magician_validator_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forbidden_term TEXT NOT NULL,
  exclude_if_contains JSONB NOT NULL DEFAULT '[]',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.magician_validator_overrides IS 'False-positive uitsluitingen voor AI Magician: als ingrediënt een exclude-patroon bevat, wordt match op forbidden_term genegeerd.';
COMMENT ON COLUMN public.magician_validator_overrides.forbidden_term IS 'Verboden term (bijv. aardappel, bloem, ei) waarop substring-match mogelijk false positive geeft';
COMMENT ON COLUMN public.magician_validator_overrides.exclude_if_contains IS 'JSON array van strings: als ingrediënttekst één hiervan bevat, is de match een false positive';

CREATE UNIQUE INDEX IF NOT EXISTS idx_magician_validator_overrides_forbidden_term_unique
  ON public.magician_validator_overrides(forbidden_term);
CREATE INDEX IF NOT EXISTS idx_magician_validator_overrides_forbidden_term
  ON public.magician_validator_overrides(forbidden_term);
CREATE INDEX IF NOT EXISTS idx_magician_validator_overrides_is_active
  ON public.magician_validator_overrides(is_active);

DROP TRIGGER IF EXISTS set_updated_at_magician_validator_overrides ON public.magician_validator_overrides;
CREATE TRIGGER set_updated_at_magician_validator_overrides
  BEFORE UPDATE ON public.magician_validator_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.magician_validator_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active magician validator overrides" ON public.magician_validator_overrides;
-- Iedereen mag actieve overrides lezen (gebruikt bij receptvalidatie)
CREATE POLICY "Anyone can read active magician validator overrides"
  ON public.magician_validator_overrides
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage magician validator overrides" ON public.magician_validator_overrides;
-- Admins kunnen schrijven (INSERT, UPDATE, DELETE)
CREATE POLICY "Admins can manage magician validator overrides"
  ON public.magician_validator_overrides
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
