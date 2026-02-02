-- Migration: Meal Plan Generation Jobs (scheduled runs + locking)
-- Description: Job queue voor geplande weekmenu-generatie; locking voor worker claim.
--              request_snapshot: alleen scheduling inputs (week_start, days, shopping_day, lead_time_hours, diet_key), geen PII.

-- ============================================================================
-- Table: meal_plan_generation_jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meal_plan_generation_jobs (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'running', 'succeeded', 'failed', 'cancelled')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ NULL,
  locked_by TEXT NULL,
  attempt INT NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  last_error_code TEXT NULL,
  last_error_message TEXT NULL,
  meal_plan_id UUID NULL REFERENCES public.meal_plans(id) ON DELETE SET NULL,
  request_snapshot JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.meal_plan_generation_jobs.locked_by IS 'Instance id or random token (e.g. Vercel deployment)';
COMMENT ON COLUMN public.meal_plan_generation_jobs.request_snapshot IS 'Small payload only: week_start, days, shopping_day, lead_time_hours, diet_key; no PII';

-- Index: due jobs (worker claims by status + scheduled_for)
CREATE INDEX IF NOT EXISTS idx_meal_plan_generation_jobs_due
  ON public.meal_plan_generation_jobs(status, scheduled_for)
  WHERE status = 'scheduled';

-- Index: user listing (own jobs by user, newest first)
CREATE INDEX IF NOT EXISTS idx_meal_plan_generation_jobs_user_scheduled
  ON public.meal_plan_generation_jobs(user_id, scheduled_for DESC);

-- Unique: one scheduled job per user per week (by week_start in request_snapshot)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plan_generation_jobs_user_week_start
  ON public.meal_plan_generation_jobs(user_id, ((request_snapshot->>'week_start')))
  WHERE request_snapshot IS NOT NULL AND status = 'scheduled';

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.meal_plan_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own jobs
CREATE POLICY "Users can view own generation jobs"
  ON public.meal_plan_generation_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert own jobs (server actions plan user-scoped jobs)
CREATE POLICY "Users can insert own generation jobs"
  ON public.meal_plan_generation_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update own jobs (worker status transitions enforced in app-layer)
CREATE POLICY "Users can update own generation jobs"
  ON public.meal_plan_generation_jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE TRIGGER set_updated_at_meal_plan_generation_jobs
  BEFORE UPDATE ON public.meal_plan_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Verification (commented; run manually if needed)
-- ============================================================================
-- Insert scheduled job for current user:
--   INSERT INTO public.meal_plan_generation_jobs (user_id, status, scheduled_for, request_snapshot)
--   VALUES (auth.uid(), 'scheduled', NOW() + interval '1 hour', '{"week_start": "2026-02-03", "days": 7, "shopping_day": "friday", "lead_time_hours": 48, "diet_key": "wahls"}'::jsonb);
--
-- Query due jobs (status = scheduled and scheduled_for <= now()):
--   SELECT id, user_id, status, scheduled_for, attempt, max_attempts
--   FROM public.meal_plan_generation_jobs
--   WHERE status = 'scheduled' AND scheduled_for <= NOW()
--   ORDER BY scheduled_for
--   LIMIT 10;
--
-- Update claim (set running + locked_at / locked_by) on one id:
--   UPDATE public.meal_plan_generation_jobs
--   SET status = 'running', locked_at = NOW(), locked_by = 'worker-1', attempt = attempt + 1, updated_at = NOW()
--   WHERE id = '<job_id>' AND status = 'scheduled';
