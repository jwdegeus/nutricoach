-- Migration: Custom Meals Database
-- Created: 2026-01-28
-- Description: Tabel voor custom maaltijden die gebruikers zelf toevoegen via foto/screenshot upload

-- ============================================================================
-- Table: custom_meals
-- ============================================================================
-- Opslag van custom maaltijden (foto upload, AI analyse, vertaling)

CREATE TABLE IF NOT EXISTS public.custom_meals (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Meal identification
  name TEXT NOT NULL, -- Meal name (in Dutch, translated if needed)
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  diet_key TEXT NULL, -- Optional diet type
  
  -- Source information
  source_type TEXT NOT NULL CHECK (source_type IN ('photo', 'screenshot', 'file', 'gemini')), -- How meal was added
  source_image_url TEXT NULL, -- URL to uploaded image (stored in Supabase Storage)
  source_image_path TEXT NULL, -- Path in storage bucket
  
  -- AI analysis result
  ai_analysis JSONB NULL, -- Full AI analysis result (ingredients, instructions, etc.)
  original_language TEXT NULL, -- Language detected in source (e.g., 'en', 'nl')
  translated_content JSONB NULL, -- Translated content if original was not Dutch
  
  -- Meal data (structured, similar to Meal type)
  meal_data JSONB NOT NULL, -- Full Meal object (ingredientRefs, etc.)
  
  -- Consumption tracking
  consumption_count INTEGER NOT NULL DEFAULT 0, -- How many times this meal has been consumed
  first_consumed_at TIMESTAMPTZ NULL,
  last_consumed_at TIMESTAMPTZ NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_custom_meals_user_id ON public.custom_meals(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_meals_user_slot ON public.custom_meals(user_id, meal_slot);
CREATE INDEX IF NOT EXISTS idx_custom_meals_consumption_count ON public.custom_meals(user_id, consumption_count DESC);
CREATE INDEX IF NOT EXISTS idx_custom_meals_last_consumed ON public.custom_meals(user_id, last_consumed_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_custom_meals_source_type ON public.custom_meals(source_type);

-- ============================================================================
-- Table: meal_consumption_log
-- ============================================================================
-- Log voor wanneer maaltijden worden geconsumeerd (voor tracking en analytics)

CREATE TABLE IF NOT EXISTS public.meal_consumption_log (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Meal reference (can be from meal_history or custom_meals)
  meal_history_id UUID NULL REFERENCES public.meal_history(id) ON DELETE SET NULL,
  custom_meal_id UUID NULL REFERENCES public.custom_meals(id) ON DELETE SET NULL,
  
  -- Meal identification (denormalized for quick access)
  meal_name TEXT NOT NULL,
  meal_slot TEXT NOT NULL,
  
  -- Consumption metadata
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT NULL -- Optional user notes about this consumption
);

-- Ensure at least one meal reference exists
ALTER TABLE public.meal_consumption_log
  ADD CONSTRAINT meal_consumption_log_meal_reference_check
  CHECK (
    (meal_history_id IS NOT NULL AND custom_meal_id IS NULL) OR
    (meal_history_id IS NULL AND custom_meal_id IS NOT NULL)
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meal_consumption_log_user_id ON public.meal_consumption_log(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_consumption_log_meal_history_id ON public.meal_consumption_log(meal_history_id);
CREATE INDEX IF NOT EXISTS idx_meal_consumption_log_custom_meal_id ON public.meal_consumption_log(custom_meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_consumption_log_consumed_at ON public.meal_consumption_log(consumed_at DESC);
CREATE INDEX IF NOT EXISTS idx_meal_consumption_log_user_consumed_at ON public.meal_consumption_log(user_id, consumed_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.custom_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_consumption_log ENABLE ROW LEVEL SECURITY;

-- Policies for custom_meals
CREATE POLICY "Users can view own custom meals"
  ON public.custom_meals
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own custom meals"
  ON public.custom_meals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own custom meals"
  ON public.custom_meals
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom meals"
  ON public.custom_meals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for meal_consumption_log
CREATE POLICY "Users can view own consumption log"
  ON public.meal_consumption_log
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own consumption log"
  ON public.meal_consumption_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own consumption log"
  ON public.meal_consumption_log
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own consumption log"
  ON public.meal_consumption_log
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE TRIGGER set_updated_at_custom_meals
  BEFORE UPDATE ON public.custom_meals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Function: Update consumption count when meal is consumed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_meal_consumption_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update custom_meal consumption count
  IF NEW.custom_meal_id IS NOT NULL THEN
    UPDATE public.custom_meals
    SET 
      consumption_count = consumption_count + 1,
      last_consumed_at = NEW.consumed_at,
      first_consumed_at = COALESCE(first_consumed_at, NEW.consumed_at),
      updated_at = NOW()
    WHERE id = NEW.custom_meal_id;
  END IF;
  
  -- Update meal_history usage_count (if applicable)
  IF NEW.meal_history_id IS NOT NULL THEN
    UPDATE public.meal_history
    SET 
      usage_count = usage_count + 1,
      last_used_at = NEW.consumed_at,
      updated_at = NOW()
    WHERE id = NEW.meal_history_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_meal_consumption_on_log
  AFTER INSERT ON public.meal_consumption_log
  FOR EACH ROW
  EXECUTE FUNCTION public.update_meal_consumption_count();
