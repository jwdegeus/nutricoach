-- Migration: Firewall Rules System
-- Created: 2026-01-31
-- Description: Herstructureert guard rails naar firewall rule systeem met allow/block en prioriteit sortering

-- ============================================================================
-- Step 1: Voeg nieuwe kolommen toe aan diet_category_constraints
-- ============================================================================

-- Voeg rule_action toe (allow/block) - dit vervangt constraint_type conceptueel maar behouden we beide voor backward compatibility
ALTER TABLE public.diet_category_constraints
  ADD COLUMN IF NOT EXISTS rule_action TEXT CHECK (rule_action IN ('allow', 'block'));

-- Voeg rule_priority toe voor expliciete sortering (kopie van priority initieel)
ALTER TABLE public.diet_category_constraints
  ADD COLUMN IF NOT EXISTS rule_priority INTEGER NOT NULL DEFAULT 50;

-- ============================================================================
-- Step 2: Migreer bestaande data
-- ============================================================================

-- Migreer constraint_type naar rule_action
UPDATE public.diet_category_constraints
SET 
  rule_action = CASE 
    WHEN constraint_type = 'forbidden' THEN 'block'
    WHEN constraint_type = 'required' THEN 'allow'
    ELSE 'block' -- Default voor edge cases
  END,
  rule_priority = priority -- Kopieer priority naar rule_priority
WHERE rule_action IS NULL;

-- Zet default voor rule_action als die nog NULL is (edge case)
UPDATE public.diet_category_constraints
SET rule_action = 'block'
WHERE rule_action IS NULL;

-- ============================================================================
-- Step 3: Maak rule_action NOT NULL (na data migratie)
-- ============================================================================

ALTER TABLE public.diet_category_constraints
  ALTER COLUMN rule_action SET NOT NULL;

-- ============================================================================
-- Step 4: Update UNIQUE constraint om zowel allow als block toe te staan
-- ============================================================================

-- Verwijder oude UNIQUE constraint
ALTER TABLE public.diet_category_constraints
  DROP CONSTRAINT IF EXISTS diet_category_constraints_diet_type_id_category_id_key;

-- Voeg nieuwe UNIQUE constraint toe die (diet_type_id, category_id, rule_action) combineert
-- Dit maakt het mogelijk om zowel allow als block te hebben voor dezelfde categorie
ALTER TABLE public.diet_category_constraints
  ADD CONSTRAINT diet_category_constraints_diet_type_category_action_unique 
  UNIQUE (diet_type_id, category_id, rule_action);

-- ============================================================================
-- Step 5: Voeg index toe voor rule_priority sortering
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_diet_category_constraints_rule_priority 
  ON public.diet_category_constraints(diet_type_id, rule_priority DESC, is_active);

-- ============================================================================
-- Step 6: Update RLS policies (geen wijzigingen nodig, maar documenteren)
-- ============================================================================

-- Bestaande RLS policies blijven geldig
-- Public kan actieve regels lezen, admins kunnen alles beheren

-- ============================================================================
-- Comments voor documentatie
-- ============================================================================

COMMENT ON COLUMN public.diet_category_constraints.rule_action IS 
  'Firewall rule actie: allow (toestaan) of block (blokkeren). Eerste match op prioriteit wint.';

COMMENT ON COLUMN public.diet_category_constraints.rule_priority IS 
  'Prioriteit voor firewall evaluatie (0-100, hoger = belangrijker). Regels worden geëvalueerd in volgorde van prioriteit (hoog naar laag).';

COMMENT ON COLUMN public.diet_category_constraints.constraint_type IS 
  'Legacy veld: behouden voor backward compatibility. Gebruik rule_action in plaats daarvan.';
