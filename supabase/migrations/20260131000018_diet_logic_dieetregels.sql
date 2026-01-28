-- Migration: Diet Logic (Dieetregels)
-- Created: 2026-01-31
-- Description: Voegt diet_logic en limiet-kolommen toe aan diet_category_constraints.
-- Dieetregels bepalen per ingredientgroep: DROP (blokkeren), FORCE (verplicht), LIMIT (beperkt), PASS (toegestaan).

-- ============================================================================
-- Step 1: Voeg diet_logic en limiet-kolommen toe aan diet_category_constraints
-- ============================================================================

-- Diet Logic: drop | force | limit | pass (P0–P3)
-- Zie docs/diet-logic-plan.md voor semantiek.
ALTER TABLE public.diet_category_constraints
  ADD COLUMN IF NOT EXISTS diet_logic TEXT NOT NULL DEFAULT 'drop'
  CHECK (diet_logic IN ('drop', 'force', 'limit', 'pass'));

-- Limieten voor diet_logic = 'limit'
ALTER TABLE public.diet_category_constraints
  ADD COLUMN IF NOT EXISTS max_per_day INTEGER NULL;

ALTER TABLE public.diet_category_constraints
  ADD COLUMN IF NOT EXISTS max_per_week INTEGER NULL;

-- ============================================================================
-- Step 2: Migreer bestaande data naar diet_logic
-- ============================================================================

-- constraint_type 'forbidden' + rule_action 'block' -> diet_logic 'drop'
UPDATE public.diet_category_constraints
SET diet_logic = 'drop'
WHERE constraint_type = 'forbidden'
  AND (rule_action = 'block' OR rule_action IS NULL);

-- constraint_type 'required' + rule_action 'allow' -> diet_logic 'force'
UPDATE public.diet_category_constraints
SET diet_logic = 'force'
WHERE constraint_type = 'required'
  AND (rule_action = 'allow' OR rule_action IS NULL);

-- Overige gevallen (required+block, forbidden+allow) default op drop
UPDATE public.diet_category_constraints
SET diet_logic = 'drop'
WHERE diet_logic IS NULL OR diet_logic = '';

-- ============================================================================
-- Step 3: Index voor evaluatie op diet_logic
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_diet_category_constraints_diet_logic
  ON public.diet_category_constraints(diet_type_id, diet_logic, is_active);

-- ============================================================================
-- Step 4: Comments (terminologie: Dieetregels, Diet Logic)
-- ============================================================================

COMMENT ON COLUMN public.diet_category_constraints.diet_logic IS
  'Diet Logic: drop (blokkeren), force (verplicht quotum), limit (max per dag/week), pass (toegestaan). Onderdeel van Dieetregels.';

COMMENT ON COLUMN public.diet_category_constraints.max_per_day IS
  'Maximaal aantal per dag voor diet_logic = limit (Dieetregels).';

COMMENT ON COLUMN public.diet_category_constraints.max_per_week IS
  'Maximaal aantal per week voor diet_logic = limit (Dieetregels).';
