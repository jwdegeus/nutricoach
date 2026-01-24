-- Migration: Meal History and Ratings
-- Created: 2026-01-26
-- Description: Tabel voor meal history met ratings, scores en metadata voor hergebruik

-- ============================================================================
-- Table: meal_history
-- ============================================================================
-- Opslag van individuele maaltijden uit meal plans voor hergebruik
-- Maaltijden worden geëxtraheerd uit meal plans en opgeslagen met ratings

CREATE TABLE IF NOT EXISTS public.meal_history (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Meal identification
  meal_id TEXT NOT NULL, -- Original meal ID from meal plan
  meal_name TEXT NOT NULL,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  diet_key TEXT NOT NULL, -- Diet type this meal was created for
  
  -- Meal data (JSONB for flexibility)
  meal_data JSONB NOT NULL, -- Full Meal object (ingredientRefs, etc.)
  
  -- Ratings and scores
  user_rating INTEGER NULL CHECK (user_rating >= 1 AND user_rating <= 5), -- 1-5 stars
  nutrition_score NUMERIC(5,2) NULL, -- Calculated nutrition score (0-100)
  variety_score NUMERIC(5,2) NULL, -- Calculated variety score (0-100)
  combined_score NUMERIC(5,2) NULL, -- Combined score for sorting
  
  -- Usage tracking
  usage_count INTEGER NOT NULL DEFAULT 0, -- How many times this meal has been reused
  first_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_meal_history_user_id ON public.meal_history(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_history_user_diet_slot ON public.meal_history(user_id, diet_key, meal_slot);
CREATE INDEX IF NOT EXISTS idx_meal_history_combined_score ON public.meal_history(user_id, combined_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_meal_history_last_used ON public.meal_history(user_id, last_used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_meal_history_meal_id ON public.meal_history(meal_id);

-- Unique constraint: one meal per user per meal_id (prevent duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_history_user_meal_id ON public.meal_history(user_id, meal_id);

-- ============================================================================
-- Table: meal_ratings
-- ============================================================================
-- Separate table for rating history (allows multiple ratings over time)
-- This enables tracking rating changes and provides audit trail

CREATE TABLE IF NOT EXISTS public.meal_ratings (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_history_id UUID NOT NULL REFERENCES public.meal_history(id) ON DELETE CASCADE,
  
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NULL, -- Optional user comment
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meal_ratings_meal_history_id ON public.meal_ratings(meal_history_id);
CREATE INDEX IF NOT EXISTS idx_meal_ratings_user_id ON public.meal_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_ratings_created_at ON public.meal_ratings(created_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.meal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_ratings ENABLE ROW LEVEL SECURITY;

-- Policies for meal_history
CREATE POLICY "Users can view own meal history"
  ON public.meal_history
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal history"
  ON public.meal_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meal history"
  ON public.meal_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies for meal_ratings
CREATE POLICY "Users can view own meal ratings"
  ON public.meal_ratings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal ratings"
  ON public.meal_ratings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meal ratings"
  ON public.meal_ratings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE TRIGGER set_updated_at_meal_history
  BEFORE UPDATE ON public.meal_history
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Function: Update meal_history when rating is added/updated
-- ============================================================================
-- This function updates the user_rating and combined_score in meal_history
-- when a new rating is added or updated

CREATE OR REPLACE FUNCTION public.update_meal_history_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the latest rating in meal_history
  UPDATE public.meal_history
  SET 
    user_rating = NEW.rating,
    updated_at = NOW()
  WHERE id = NEW.meal_history_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_meal_history_on_rating
  AFTER INSERT OR UPDATE ON public.meal_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_meal_history_rating();
