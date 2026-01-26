-- Migration: Add original_recipe_json to recipe_imports
-- Created: 2026-01-31
-- Description: Voeg original_recipe_json veld toe om originele (niet-vertaalde) versie op te slaan

ALTER TABLE public.recipe_imports
  ADD COLUMN IF NOT EXISTS original_recipe_json JSONB NULL;

COMMENT ON COLUMN public.recipe_imports.original_recipe_json IS 'Original extracted recipe in source language (before translation)';
