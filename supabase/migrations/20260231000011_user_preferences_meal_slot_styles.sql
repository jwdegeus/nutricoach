-- Migration: Add meal-slot style preferences to user_preferences
-- Description: Voorkeuren per maaltijdslot (ontbijt/lunch/diner) voor generatie-templates.
-- Out of scope: UI (stap 59), generator enforcement (stap 60).

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS preferred_breakfast_style TEXT NULL
    CONSTRAINT user_preferences_breakfast_style_check
    CHECK (preferred_breakfast_style IS NULL OR preferred_breakfast_style IN ('any','shake','eggs','yogurt','oatmeal')),
  ADD COLUMN IF NOT EXISTS preferred_lunch_style TEXT NULL
    CONSTRAINT user_preferences_lunch_style_check
    CHECK (preferred_lunch_style IS NULL OR preferred_lunch_style IN ('any','salad','smoothie','leftovers','soup')),
  ADD COLUMN IF NOT EXISTS preferred_dinner_style TEXT NULL
    CONSTRAINT user_preferences_dinner_style_check
    CHECK (preferred_dinner_style IS NULL OR preferred_dinner_style IN ('any','quick','family','high_protein'));

COMMENT ON COLUMN public.user_preferences.preferred_breakfast_style IS 'Ontbijt-template: any, shake, eggs, yogurt, oatmeal; NULL = geen voorkeur (any)';
COMMENT ON COLUMN public.user_preferences.preferred_lunch_style IS 'Lunch-template: any, salad, smoothie, leftovers, soup; NULL = geen voorkeur (any)';
COMMENT ON COLUMN public.user_preferences.preferred_dinner_style IS 'Diner-template: any, quick, family, high_protein; NULL = geen voorkeur (any)';

-- Verificatiequeries (als commentaar)
-- SELECT user_id, preferred_breakfast_style, preferred_lunch_style, preferred_dinner_style
--   FROM public.user_preferences WHERE user_id = auth.uid();
