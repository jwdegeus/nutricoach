-- Migration: Recipe Imports
-- Created: 2026-01-29
-- Description: Tabel voor recipe import jobs (foto upload, OCR, Gemini processing, review)

-- ============================================================================
-- Table: recipe_imports
-- ============================================================================
-- Opslag van recipe import jobs met status tracking en processing data

CREATE TABLE IF NOT EXISTS public.recipe_imports (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('uploaded', 'processing', 'ready_for_review', 'failed', 'finalized')) DEFAULT 'uploaded',
  
  -- Source image metadata (no actual file storage in this step)
  source_image_path TEXT NULL, -- Path placeholder for future storage implementation
  source_image_meta JSONB NULL, -- { filename, size, mimetype, etc. }
  
  -- Locale information
  source_locale TEXT NULL, -- Detected source language (e.g., 'en', 'nl')
  target_locale TEXT NULL, -- Target language for translation (e.g., 'nl')
  
  -- Processing data (populated in later steps)
  raw_ocr_text TEXT NULL, -- OCR extracted text (future)
  gemini_raw_json JSONB NULL, -- Raw Gemini API response (future)
  extracted_recipe_json JSONB NULL, -- Parsed recipe data (future)
  validation_errors_json JSONB NULL, -- Validation errors if any (future)
  confidence_overall NUMERIC(5,2) NULL, -- Overall confidence score 0-100 (future)
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ NULL -- When recipe was finalized to recipes table
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_recipe_imports_user_id ON public.recipe_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_imports_user_created_at ON public.recipe_imports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_imports_status ON public.recipe_imports(status);
CREATE INDEX IF NOT EXISTS idx_recipe_imports_user_status ON public.recipe_imports(user_id, status);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.recipe_imports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own recipe imports
CREATE POLICY "Users can view own recipe imports"
  ON public.recipe_imports
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert own recipe imports
-- Note: user_id is set server-side, not from client
CREATE POLICY "Users can insert own recipe imports"
  ON public.recipe_imports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update own recipe imports
CREATE POLICY "Users can update own recipe imports"
  ON public.recipe_imports
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete own recipe imports
CREATE POLICY "Users can delete own recipe imports"
  ON public.recipe_imports
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE TRIGGER set_updated_at_recipe_imports
  BEFORE UPDATE ON public.recipe_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
