-- Migration: Meal recent views ("Recent bekeken" recepten)
-- Description: User ↔ custom_meals junction; per user+meal de laatste view-timestamp (deduped).
--              RLS: user_id = auth.uid(); INSERT restricted to own meals (consistent met meal_favorites).
-- Security: RLS-first; no SELECT *; minimal columns.

-- ============================================================================
-- Table: meal_recent_views
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.meal_recent_views (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_id UUID NOT NULL REFERENCES public.custom_meals(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_recent_views_user_meal_unique UNIQUE (user_id, meal_id)
);

COMMENT ON TABLE public.meal_recent_views IS 'Recent bekeken recepten: per user+meal de laatste view-timestamp; deduped voor "Recent" tab.';
COMMENT ON COLUMN public.meal_recent_views.last_viewed_at IS 'Laatste keer dat de user dit recept (detail) heeft bekeken; wordt bij view upsert gezet naar now().';
COMMENT ON COLUMN public.meal_recent_views.meal_id IS 'References custom_meals(id). User may only log views for own meals (enforced in RLS INSERT).';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meal_recent_views_user_last_viewed
  ON public.meal_recent_views(user_id, last_viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_meal_recent_views_meal_id
  ON public.meal_recent_views(meal_id);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.meal_recent_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own meal recent views"
  ON public.meal_recent_views
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal recent views"
  ON public.meal_recent_views
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.custom_meals m
      WHERE m.id = meal_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own meal recent views"
  ON public.meal_recent_views
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own meal recent views"
  ON public.meal_recent_views
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Validatie (voorbeeld queries in comments – run handmatig om RLS + constraints te verifiëren)
-- ============================================================================
-- INSERT (alleen eigen recept):
--   INSERT INTO public.meal_recent_views (user_id, meal_id)
--   SELECT auth.uid(), '.<custom_meal_id>.'
--   WHERE EXISTS (SELECT 1 FROM public.custom_meals m WHERE m.id = '.<custom_meal_id>.' AND m.user_id = auth.uid());
--
-- UPSERT (view event): insert of update last_viewed_at naar now()
--   INSERT INTO public.meal_recent_views (user_id, meal_id, last_viewed_at)
--   VALUES (auth.uid(), '.<meal_id>.', NOW())
--   ON CONFLICT (user_id, meal_id) DO UPDATE SET last_viewed_at = NOW();
--   (RLS: user mag alleen eigen recepten; policy check bij INSERT; UPDATE policy user_id = auth.uid())
--
-- SELECT (eigen recente lijst, nieuwste view eerst):
--   SELECT id, user_id, meal_id, last_viewed_at, created_at
--   FROM public.meal_recent_views
--   WHERE user_id = auth.uid()
--   ORDER BY last_viewed_at DESC
--   LIMIT 24;
--
-- DELETE (housekeeping / ontvolgen):
--   DELETE FROM public.meal_recent_views
--   WHERE user_id = auth.uid() AND meal_id = '.<meal_id>.';
--
-- Constraints: UNIQUE (user_id, meal_id); meal_id ON DELETE CASCADE; user_id ON DELETE CASCADE.
