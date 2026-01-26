-- Migration: Recipe Adaptations
-- Created: 2026-01-31
-- Description: Tabellen voor recipe adaptations (dieet-compatibele versies) en adaptation runs (audit trail)

-- ============================================================================
-- Table: recipe_adaptations
-- ============================================================================
-- Opslag van user-varianten van recepten (aangepast naar dieet)
-- Status: 'draft' | 'applied' | 'archived'

CREATE TABLE IF NOT EXISTS public.recipe_adaptations (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Recipe reference
  recipe_id TEXT NOT NULL, -- References custom_meals.id or meal_history.id (TEXT for flexibility)
  diet_id TEXT NOT NULL,   -- Diet identifier (references diet_types.name or custom diet key)
  diet_ruleset_version INTEGER NOT NULL DEFAULT 1,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('draft', 'applied', 'archived')),
  
  -- Adaptation data
  title TEXT NOT NULL,
  analysis_summary TEXT NULL,
  analysis_violations JSONB NOT NULL DEFAULT '[]',
  rewrite_ingredients JSONB NOT NULL DEFAULT '[]',
  rewrite_steps JSONB NOT NULL DEFAULT '[]',
  nutrition_estimate JSONB NULL,
  confidence NUMERIC(5,2) NULL, -- 0.00 to 1.00
  open_questions JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recipe_adaptations_user_id ON public.recipe_adaptations(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptations_user_recipe_diet ON public.recipe_adaptations(user_id, recipe_id, diet_id);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptations_user_status ON public.recipe_adaptations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptations_recipe_id ON public.recipe_adaptations(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptations_diet_id ON public.recipe_adaptations(diet_id);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptations_created_at ON public.recipe_adaptations(created_at DESC);

-- ============================================================================
-- Table: recipe_adaptation_runs
-- ============================================================================
-- Audit trail per AI run voor recipe adaptation
-- Logt input, output, validation, en outcome voor reproduceerbaarheid

CREATE TABLE IF NOT EXISTS public.recipe_adaptation_runs (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_adaptation_id UUID NOT NULL REFERENCES public.recipe_adaptations(id) ON DELETE CASCADE,
  
  -- Model and prompt info
  model TEXT NULL,           -- e.g., "gemini-2.0-flash-exp"
  prompt_version INTEGER NOT NULL DEFAULT 1,
  
  -- Snapshots for reproducibility
  input_snapshot JSONB NOT NULL,      -- RequestRecipeAdaptationInput snapshot
  output_snapshot JSONB NOT NULL,     -- RecipeAdaptationDraft snapshot
  validation_report JSONB NOT NULL,   -- ValidationReport snapshot
  
  -- Outcome
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'needs_retry', 'failed')),
  
  -- Observability
  tokens_in INTEGER NULL,
  tokens_out INTEGER NULL,
  latency_ms INTEGER NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_runs_adaptation_id ON public.recipe_adaptation_runs(recipe_adaptation_id);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_runs_adaptation_created ON public.recipe_adaptation_runs(recipe_adaptation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_runs_outcome ON public.recipe_adaptation_runs(outcome);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_runs_created_at ON public.recipe_adaptation_runs(created_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.recipe_adaptations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_adaptation_runs ENABLE ROW LEVEL SECURITY;

-- Policies for recipe_adaptations
CREATE POLICY "Users can view own recipe adaptations"
  ON public.recipe_adaptations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recipe adaptations"
  ON public.recipe_adaptations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recipe adaptations"
  ON public.recipe_adaptations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recipe adaptations"
  ON public.recipe_adaptations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for recipe_adaptation_runs
-- Users can view runs for their own adaptations
CREATE POLICY "Users can view own adaptation runs"
  ON public.recipe_adaptation_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipe_adaptations
      WHERE recipe_adaptations.id = recipe_adaptation_runs.recipe_adaptation_id
      AND recipe_adaptations.user_id = auth.uid()
    )
  );

-- Users can insert runs for their own adaptations
CREATE POLICY "Users can insert own adaptation runs"
  ON public.recipe_adaptation_runs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipe_adaptations
      WHERE recipe_adaptations.id = recipe_adaptation_runs.recipe_adaptation_id
      AND recipe_adaptations.user_id = auth.uid()
    )
  );

-- Note: No UPDATE/DELETE policies for runs - runs are immutable for audit trail

-- ============================================================================
-- Triggers
-- ============================================================================

CREATE TRIGGER set_updated_at_recipe_adaptations
  BEFORE UPDATE ON public.recipe_adaptations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
