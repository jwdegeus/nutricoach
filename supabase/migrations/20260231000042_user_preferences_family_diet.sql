-- Family-level diet: one diet for the whole household (user_preferences).
-- Meal plan generator uses this; per-member we keep allergies/dislikes only.
-- See docs/settings-user-vs-family.md.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS diet_type_id UUID NULL REFERENCES public.diet_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS diet_strictness INTEGER NULL CHECK (diet_strictness >= 1 AND diet_strictness <= 10),
  ADD COLUMN IF NOT EXISTS diet_is_inflamed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_preferences.diet_type_id IS 'Gezinsdieet: één dieet voor het hele huishouden. Bepaalt receptpool en dieetregels voor weekmenu.';
COMMENT ON COLUMN public.user_preferences.diet_strictness IS 'Strictness 1–10 voor gezinsdieet (optioneel).';
COMMENT ON COLUMN public.user_preferences.diet_is_inflamed IS 'Bij true: nachtschade-uitsluiting voor gezinsdieet.';

-- Backfill: set family diet from default family member (is_self, else first by sort_order).
WITH default_member AS (
  SELECT DISTINCT ON (fm.user_id)
    fm.user_id,
    fm.id AS family_member_id
  FROM public.family_members fm
  ORDER BY fm.user_id, fm.is_self DESC, fm.sort_order ASC, fm.created_at ASC
),
member_diet AS (
  SELECT
    dm.user_id,
    dp.diet_type_id,
    dp.strictness AS diet_strictness,
    COALESCE(dp.is_inflamed, false) AS diet_is_inflamed
  FROM default_member dm
  JOIN public.family_member_diet_profiles dp ON dp.family_member_id = dm.family_member_id AND dp.ends_on IS NULL
)
UPDATE public.user_preferences up
SET
  diet_type_id = md.diet_type_id,
  diet_strictness = md.diet_strictness,
  diet_is_inflamed = md.diet_is_inflamed
FROM member_diet md
WHERE up.user_id = md.user_id
  AND up.diet_type_id IS NULL
  AND md.diet_type_id IS NOT NULL;
