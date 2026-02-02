-- Migration: Add weekend override preferences to user_preferences
-- Description: Weekend diner-voorkeur en definitie weekenddagen (za/zo) voor stap 64 (UI) en 65 (generator).
-- Out of scope: RLS, UI, generator enforcement.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS preferred_weekend_dinner_style TEXT NULL
    CONSTRAINT user_preferences_weekend_dinner_style_check
    CHECK (preferred_weekend_dinner_style IS NULL OR preferred_weekend_dinner_style IN ('any','quick','family','high_protein','special')),
  ADD COLUMN IF NOT EXISTS weekend_days INT[] NOT NULL DEFAULT '{6,0}'
    CONSTRAINT user_preferences_weekend_days_check
    CHECK (
      array_length(weekend_days, 1) BETWEEN 1 AND 2
      AND (
        (array_length(weekend_days, 1) = 1 AND weekend_days[1] BETWEEN 0 AND 6)
        OR (array_length(weekend_days, 1) = 2 AND weekend_days[1] BETWEEN 0 AND 6 AND weekend_days[2] BETWEEN 0 AND 6)
      )
    );

COMMENT ON COLUMN public.user_preferences.preferred_weekend_dinner_style IS 'Diner-template voor weekenddagen: any, quick, family, high_protein, special; NULL = geen override (gebruik gewone diner-voorkeur)';
COMMENT ON COLUMN public.user_preferences.weekend_days IS 'Weekenddagen als dag-van-week (0=zondag..6=zaterdag); default {6,0} = za+zo';

-- Verificatiequeries (als commentaar)
-- SELECT user_id, preferred_weekend_dinner_style, weekend_days FROM public.user_preferences WHERE user_id = auth.uid();
-- SELECT array_length(weekend_days, 1), (SELECT bool_and(d >= 0 AND d <= 6) FROM unnest(weekend_days) AS d) FROM public.user_preferences LIMIT 1;
