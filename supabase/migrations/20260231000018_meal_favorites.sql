-- Migration: Meal favorites ("Opgeslagen" recepten)
-- Description: User ↔ custom_meals junction for saved/favorite recipes.
--              RLS: user_id = auth.uid(); INSERT restricted to own meals.
-- Security: RLS-first; no SELECT *; minimal columns.

-- ============================================================================
-- Table: meal_favorites
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meal_favorites (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_id UUID NOT NULL REFERENCES public.custom_meals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_favorites_user_meal_unique UNIQUE (user_id, meal_id)
);

COMMENT ON TABLE public.meal_favorites IS 'User favorites: which custom_meals (recipes) the user has saved for quick access via "Opgeslagen" tab.';
COMMENT ON COLUMN public.meal_favorites.meal_id IS 'References custom_meals(id). User may only favorite own meals (enforced in RLS INSERT).';

-- Indexes (UNIQUE on user_id, meal_id is already enforced by constraint)
CREATE INDEX IF NOT EXISTS idx_meal_favorites_user_created
  ON public.meal_favorites(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meal_favorites_meal_id
  ON public.meal_favorites(meal_id);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.meal_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own meal favorites"
  ON public.meal_favorites
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal favorites"
  ON public.meal_favorites
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.custom_meals m
      WHERE m.id = meal_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own meal favorites"
  ON public.meal_favorites
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Validatie (voorbeeld queries in comments – run handmatig om RLS + constraints te verifiëren)
-- ============================================================================
-- INSERT (alleen eigen recept):
--   INSERT INTO public.meal_favorites (user_id, meal_id)
--   SELECT auth.uid(), '.<custom_meal_id>.'
--   WHERE EXISTS (SELECT 1 FROM public.custom_meals m WHERE m.id = '.<custom_meal_id>.' AND m.user_id = auth.uid());
--
-- SELECT (eigen opgeslagen lijst, nieuwste eerst):
--   SELECT id, user_id, meal_id, created_at
--   FROM public.meal_favorites
--   WHERE user_id = auth.uid()
--   ORDER BY created_at DESC;
--
-- DELETE (ontopslaan):
--   DELETE FROM public.meal_favorites
--   WHERE user_id = auth.uid() AND meal_id = '.<meal_id>.';
--
-- Check of recept opgeslagen is (reverse lookup):
--   SELECT EXISTS (
--     SELECT 1 FROM public.meal_favorites
--     WHERE user_id = auth.uid() AND meal_id = '.<meal_id>.'
--   );
--
-- Constraints: UNIQUE (user_id, meal_id); meal_id ON DELETE CASCADE; user_id ON DELETE CASCADE.
