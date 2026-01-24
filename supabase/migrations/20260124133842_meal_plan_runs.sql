-- Migration: Meal Plan Runs (Observability)
-- Created: 2026-01-24
-- Description: Tabel voor logging van meal plan generation runs (timing, errors, model)

-- ============================================================================
-- Table: meal_plan_runs
-- ============================================================================
-- Observability logging voor meal plan generation
-- Logt duration, model, status, errors (zonder prompts of API keys)

CREATE TABLE IF NOT EXISTS public.meal_plan_runs (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_plan_id UUID NULL REFERENCES public.meal_plans(id) ON DELETE SET NULL,
  run_type TEXT NOT NULL, -- "generate" | "regenerate" | "enrich"
  model TEXT NOT NULL,     -- e.g. "gemini-2.0-flash-exp"
  status TEXT NOT NULL,    -- "success" | "error"
  duration_ms INTEGER NOT NULL,
  error_code TEXT NULL,    -- e.g. "VALIDATION_ERROR" | "AGENT_ERROR"
  error_message TEXT NULL, -- Kort, geen prompt of gevoelige data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meal_plan_runs_user_id ON public.meal_plan_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_runs_meal_plan_id ON public.meal_plan_runs(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_runs_created_at ON public.meal_plan_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meal_plan_runs_status ON public.meal_plan_runs(status);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.meal_plan_runs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own run logs
CREATE POLICY "Users can view own meal plan runs"
  ON public.meal_plan_runs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert own run logs
CREATE POLICY "Users can insert own meal plan runs"
  ON public.meal_plan_runs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Note: No UPDATE/DELETE policies - runs are immutable for audit trail
