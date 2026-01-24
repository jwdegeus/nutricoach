-- Migration: Meal Plans
-- Created: 2026-01-24
-- Description: Tabel voor meal plan snapshots (JSONB) met request, rules, en plan data

-- ============================================================================
-- Table: meal_plans
-- ============================================================================
-- Opslag van meal plans per gebruiker
-- Snapshots van request, rules, en generated plan in JSONB voor historie

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  diet_key TEXT NOT NULL,
  date_from DATE NOT NULL,
  days INTEGER NOT NULL,
  request_snapshot JSONB NOT NULL, -- MealPlanRequest snapshot (incl. profile)
  rules_snapshot JSONB NOT NULL,   -- DietRuleSet snapshot
  plan_snapshot JSONB NOT NULL,    -- MealPlanResponse
  enrichment_snapshot JSONB NULL,  -- MealPlanEnrichmentResponse (optioneel, later)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON public.meal_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_date_from ON public.meal_plans(user_id, date_from);
CREATE INDEX IF NOT EXISTS idx_meal_plans_created_at ON public.meal_plans(created_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own meal plans
CREATE POLICY "Users can view own meal plans"
  ON public.meal_plans
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert own meal plans
CREATE POLICY "Users can insert own meal plans"
  ON public.meal_plans
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update own meal plans
CREATE POLICY "Users can update own meal plans"
  ON public.meal_plans
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete own meal plans
CREATE POLICY "Users can delete own meal plans"
  ON public.meal_plans
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE TRIGGER set_updated_at_meal_plans
  BEFORE UPDATE ON public.meal_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
