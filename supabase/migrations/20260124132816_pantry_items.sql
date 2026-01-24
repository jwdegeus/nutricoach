-- Migration: Pantry Items
-- Created: 2026-01-24
-- Description: Tabel voor pantry/inventory items per gebruiker op NEVO code niveau

-- ============================================================================
-- Table: pantry_items
-- ============================================================================
-- Opslag van pantry items per gebruiker
-- Ondersteunt quantity-based (available_g) en binary (is_available) pantry models

CREATE TABLE IF NOT EXISTS public.pantry_items (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nevo_code TEXT NOT NULL,
  available_g NUMERIC(10, 2) NULL, -- NULL betekent "binair aanwezig" (optioneel), anders hoeveelheid in gram
  is_available BOOLEAN NOT NULL DEFAULT true, -- Voor binaire pantry (kan samen met available_g gebruikt worden)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: één pantry item per user per nevo_code
  CONSTRAINT pantry_items_user_nevo_unique UNIQUE (user_id, nevo_code)
);

-- Index voor snelle lookups op user_id
CREATE INDEX IF NOT EXISTS idx_pantry_items_user_id ON public.pantry_items(user_id);

-- Index voor snelle lookups op nevo_code (voor bulk queries)
CREATE INDEX IF NOT EXISTS idx_pantry_items_nevo_code ON public.pantry_items(nevo_code);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own pantry items
CREATE POLICY "Users can view own pantry items"
  ON public.pantry_items
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert own pantry items
CREATE POLICY "Users can insert own pantry items"
  ON public.pantry_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update own pantry items
CREATE POLICY "Users can update own pantry items"
  ON public.pantry_items
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete own pantry items
CREATE POLICY "Users can delete own pantry items"
  ON public.pantry_items
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Trigger voor updated_at
-- ============================================================================

-- Functie handle_updated_at() bestaat al (aangemaakt in 20241201000000_onboarding.sql)
-- We gebruiken dezelfde functie

CREATE TRIGGER set_updated_at_pantry_items
  BEFORE UPDATE ON public.pantry_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
