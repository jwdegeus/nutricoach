-- Migration: Meal plan runs – constraints observability (no PII)
-- Created: 2026-02-01
-- Description: Voegt metadata-kolommen toe aan meal_plan_runs voor debug (constraints in prompt, ruleset hash/version).
-- Geen RLS/policy wijzigingen.

ALTER TABLE public.meal_plan_runs
  ADD COLUMN IF NOT EXISTS constraints_in_prompt BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardrails_content_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS guardrails_version TEXT NULL;
