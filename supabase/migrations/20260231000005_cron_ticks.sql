-- Migration: Cron ticks
-- Description: Log per cron run (meal_plan_jobs etc.) for observability.
--              Inserts via service role (API route); read-only for authenticated users.

-- ============================================================================
-- Table: cron_ticks
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cron_ticks (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  outcome TEXT NULL,
  job_id UUID NULL,
  user_id UUID NULL,
  meal_plan_id UUID NULL,
  error_code TEXT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for "last tick per cron" queries
CREATE INDEX IF NOT EXISTS idx_cron_ticks_cron_name_ran_at
  ON public.cron_ticks (cron_name, ran_at DESC);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE public.cron_ticks ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read ticks (read-only; no INSERT/UPDATE/DELETE for anon/authenticated)
CREATE POLICY "Authenticated can read cron_ticks"
  ON public.cron_ticks
  FOR SELECT
  TO authenticated
  USING (true);

-- Inserts only via service_role (no policy = bypass for service_role only)
