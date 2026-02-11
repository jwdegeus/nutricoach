-- Migration: Dashboard query indexes
-- Description: Indexes for dashboard loader hot-path queries (dashboard.loader.ts).
-- User-scoped: RLS unchanged; indexes only improve query latency.
-- Idempotent: CREATE INDEX IF NOT EXISTS.

-- family_members: dashboard lists members by user_id, ORDER BY sort_order ASC, created_at ASC
-- Existing idx_family_members_user_id covers filter only; composite improves sort.
CREATE INDEX IF NOT EXISTS idx_family_members_user_sort
  ON public.family_members(user_id, sort_order, created_at);

-- custom_meals: dashboard "top consumed" query
-- WHERE user_id = ? ORDER BY consumption_count DESC, last_consumed_at DESC NULLS LAST LIMIT 5
-- Existing idx_custom_meals_consumption_count has (user_id, consumption_count DESC).
-- This composite covers full ORDER BY for deterministic top-N when ties exist.
CREATE INDEX IF NOT EXISTS idx_custom_meals_user_top_consumed
  ON public.custom_meals(user_id, consumption_count DESC, last_consumed_at DESC NULLS LAST);
