-- Migration: Meal Plan Changes Tracking
-- Created: 2026-01-27
-- Description: Tabel voor het tracken van wijzigingen aan meal plans (edits, deletions)

-- ============================================================================
-- Table: meal_plan_changes
-- ============================================================================
-- Opslag van wijzigingen aan meal plans voor audit trail en business logic

CREATE TABLE IF NOT EXISTS public.meal_plan_changes (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Change details
  change_type TEXT NOT NULL CHECK (change_type IN ('meal_edited', 'meal_deleted', 'meal_added', 'day_regenerated')),
  date DATE NOT NULL, -- Date of the meal/day that was changed
  meal_slot TEXT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')), -- NULL for day-level changes
  meal_id TEXT NULL, -- Original meal ID (for tracking specific meals)
  
  -- Change metadata
  old_meal_data JSONB NULL, -- Snapshot of meal before change (for meal_edited/deleted)
  new_meal_data JSONB NULL, -- Snapshot of meal after change (for meal_edited/added)
  change_reason TEXT NULL, -- User-provided reason or system reason
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meal_plan_changes_meal_plan_id ON public.meal_plan_changes(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_changes_user_id ON public.meal_plan_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_changes_date ON public.meal_plan_changes(date);
CREATE INDEX IF NOT EXISTS idx_meal_plan_changes_created_at ON public.meal_plan_changes(created_at DESC);

-- ============================================================================
-- Table: meal_plan_locks
-- ============================================================================
-- Tracks which meals/days are locked (cannot be edited/deleted) because products are purchased

CREATE TABLE IF NOT EXISTS public.meal_plan_locks (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Lock details
  lock_type TEXT NOT NULL CHECK (lock_type IN ('meal', 'day', 'plan')), -- What is locked
  date DATE NOT NULL, -- Date of the meal/day that is locked
  meal_slot TEXT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')), -- NULL for day/plan locks
  meal_id TEXT NULL, -- Specific meal ID if meal-level lock
  
  -- Lock reason
  lock_reason TEXT NOT NULL DEFAULT 'products_purchased', -- Why it's locked
  locked_ingredients JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of nevoCodes that are purchased
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meal_plan_locks_meal_plan_id ON public.meal_plan_locks(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_locks_user_id ON public.meal_plan_locks(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_locks_date ON public.meal_plan_locks(date);
CREATE INDEX IF NOT EXISTS idx_meal_plan_locks_meal_slot ON public.meal_plan_locks(meal_slot) WHERE meal_slot IS NOT NULL;

-- Unique constraint: one lock per meal/day/plan
-- Using a unique constraint instead of index for ON CONFLICT support
ALTER TABLE public.meal_plan_locks
  ADD CONSTRAINT meal_plan_locks_unique 
  UNIQUE (meal_plan_id, date, meal_slot, meal_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.meal_plan_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_locks ENABLE ROW LEVEL SECURITY;

-- Policies for meal_plan_changes
CREATE POLICY "Users can view own meal plan changes"
  ON public.meal_plan_changes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal plan changes"
  ON public.meal_plan_changes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policies for meal_plan_locks
CREATE POLICY "Users can view own meal plan locks"
  ON public.meal_plan_locks
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal plan locks"
  ON public.meal_plan_locks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meal plan locks"
  ON public.meal_plan_locks
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meal plan locks"
  ON public.meal_plan_locks
  FOR DELETE
  USING (auth.uid() = user_id);
