-- Migration: FNDDS Survey Food Translations (nl-NL display layer)
-- Description: Translations for FNDDS survey foods; source data stays EN + provenance.

CREATE TABLE IF NOT EXISTS public.fndds_survey_food_translations (
  fdc_id INTEGER NOT NULL REFERENCES public.fndds_survey_foods(fdc_id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'nl-NL',
  display_name TEXT NOT NULL,
  synonyms JSONB,
  status TEXT NOT NULL DEFAULT 'machine' CHECK (status IN ('untranslated', 'machine', 'reviewed')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fdc_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_fndds_survey_food_translations_locale_display_name
  ON public.fndds_survey_food_translations(locale, display_name);

CREATE INDEX IF NOT EXISTS idx_fndds_survey_food_translations_synonyms
  ON public.fndds_survey_food_translations USING gin(synonyms);

CREATE TRIGGER set_updated_at_fndds_survey_food_translations
  BEFORE UPDATE ON public.fndds_survey_food_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.fndds_survey_food_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FNDDS survey food translations are publicly readable"
  ON public.fndds_survey_food_translations
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert fndds_survey_food_translations"
  ON public.fndds_survey_food_translations
  FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update fndds_survey_food_translations"
  ON public.fndds_survey_food_translations
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete fndds_survey_food_translations"
  ON public.fndds_survey_food_translations
  FOR DELETE
  USING (public.is_admin(auth.uid()));
