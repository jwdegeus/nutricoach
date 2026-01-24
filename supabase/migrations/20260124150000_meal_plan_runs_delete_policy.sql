-- Migration: Meal Plan Runs Delete Policy
-- Created: 2026-01-24
-- Description: Add DELETE policy for meal_plan_runs to allow users to delete their own runs

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Drop policy if it exists (idempotent)
DROP POLICY IF EXISTS "Users can delete own meal plan runs" ON public.meal_plan_runs;

-- Policy: Users can delete own run logs
CREATE POLICY "Users can delete own meal plan runs"
  ON public.meal_plan_runs
  FOR DELETE
  USING (auth.uid() = user_id);
