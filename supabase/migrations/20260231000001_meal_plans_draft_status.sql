-- Migration: Meal plans draft status and draft snapshot
-- Description: Add status (draft | applied | archived), draft_plan_snapshot, draft_created_at, applied_at
--              for weekmenu v2 review/apply flow. Backfill existing rows to applied.

-- ============================================================================
-- Add columns
-- ============================================================================

ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'applied' CHECK (status IN ('draft', 'applied', 'archived')),
  ADD COLUMN IF NOT EXISTS draft_plan_snapshot JSONB NULL,
  ADD COLUMN IF NOT EXISTS draft_created_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NULL;

-- ============================================================================
-- Backfill existing rows (idempotent, defensive)
-- ============================================================================
-- Existing plans: status = 'applied', applied_at = created_at for audit

UPDATE public.meal_plans
SET status = 'applied',
    applied_at = COALESCE(created_at, NOW())
WHERE status IS NULL
   OR applied_at IS NULL;

-- ============================================================================
-- Verification (commented; run manually if needed)
-- ============================================================================
-- Columns exist:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'meal_plans'
--   AND column_name IN ('status', 'draft_plan_snapshot', 'draft_created_at', 'applied_at');
--
-- Status constraint and backfill result (count per status):
--   SELECT status, COUNT(*) FROM public.meal_plans GROUP BY status;
