-- Migration: magician_ingredient_synonyms
-- Description: Extra synoniemen voor ingrediënten-matching (NL↔EN).
-- Vervangt hardcoded EXTRA_INGREDIENT_SYNONYMS in diet-validator.ts.
-- Alleen voor matching (bijv. mozzarella→cheese); exclusions zitten in magician_validator_overrides.

CREATE TABLE IF NOT EXISTS public.magician_ingredient_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forbidden_term TEXT NOT NULL,
  synonym TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(forbidden_term, synonym)
);

COMMENT ON TABLE public.magician_ingredient_synonyms IS 'Extra synoniemen voor ingrediënten-matching: wanneer ruleset term X heeft, match ook op deze synoniemen (NL↔EN)';
COMMENT ON COLUMN public.magician_ingredient_synonyms.forbidden_term IS 'Verboden term uit ruleset (bijv. cheese, dairy, sugar)';
COMMENT ON COLUMN public.magician_ingredient_synonyms.synonym IS 'Synoniem dat ook als match telt (bijv. mozzarella, honing)';

CREATE INDEX IF NOT EXISTS idx_magician_ingredient_synonyms_forbidden_term
  ON public.magician_ingredient_synonyms(forbidden_term);
CREATE INDEX IF NOT EXISTS idx_magician_ingredient_synonyms_is_active
  ON public.magician_ingredient_synonyms(is_active);

DROP TRIGGER IF EXISTS set_updated_at_magician_ingredient_synonyms ON public.magician_ingredient_synonyms;
CREATE TRIGGER set_updated_at_magician_ingredient_synonyms
  BEFORE UPDATE ON public.magician_ingredient_synonyms
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.magician_ingredient_synonyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active magician ingredient synonyms" ON public.magician_ingredient_synonyms;
CREATE POLICY "Anyone can read active magician ingredient synonyms"
  ON public.magician_ingredient_synonyms
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage magician ingredient synonyms" ON public.magician_ingredient_synonyms;
CREATE POLICY "Admins can manage magician ingredient synonyms"
  ON public.magician_ingredient_synonyms
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
