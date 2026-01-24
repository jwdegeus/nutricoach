-- Migration: Meal Plan Runs Update Policy
-- Created: 2026-01-24
-- Description: Add UPDATE policy for meal_plan_runs to support "running" status updates

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Policy: Users can update own run logs (for status updates from "running" to "success"/"error")
CREATE POLICY "Users can update own meal plan runs"
  ON public.meal_plan_runs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
