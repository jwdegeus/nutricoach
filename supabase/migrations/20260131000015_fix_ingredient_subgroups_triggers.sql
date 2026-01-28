-- Migration: Fix Ingredient Subgroups Triggers and Policies
-- Created: 2026-01-31
-- Description: Voegt ontbrekende triggers en policies toe voor ingredient_subgroups
-- Idempotent: Kan meerdere keren worden uitgevoerd zonder side effects

BEGIN;

-- ============================================================================
-- Function: check_subgroup_category_match
-- ============================================================================

CREATE OR REPLACE FUNCTION check_subgroup_category_match()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subgroup_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 
      FROM public.ingredient_subgroups sg
      WHERE sg.id = NEW.subgroup_id 
        AND sg.category_id = NEW.category_id
    ) THEN
      RAISE EXCEPTION 'subgroup_id must belong to the same category as category_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: check_subgroup_category_match_trigger
-- ============================================================================

DROP TRIGGER IF EXISTS check_subgroup_category_match_trigger ON public.ingredient_category_items;

CREATE TRIGGER check_subgroup_category_match_trigger
  BEFORE INSERT OR UPDATE ON public.ingredient_category_items
  FOR EACH ROW
  EXECUTE FUNCTION check_subgroup_category_match();

-- ============================================================================
-- Trigger: set_updated_at_ingredient_subgroups
-- ============================================================================

DROP TRIGGER IF EXISTS set_updated_at_ingredient_subgroups ON public.ingredient_subgroups;

CREATE TRIGGER set_updated_at_ingredient_subgroups
  BEFORE UPDATE ON public.ingredient_subgroups
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE public.ingredient_subgroups ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (idempotent)
DROP POLICY IF EXISTS "Admins can manage ingredient subgroups" ON public.ingredient_subgroups;
DROP POLICY IF EXISTS "Users can view active ingredient subgroups" ON public.ingredient_subgroups;

-- Policy: Admins kunnen alles zien en bewerken
CREATE POLICY "Admins can manage ingredient subgroups"
  ON public.ingredient_subgroups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- Policy: Anderen kunnen alleen lezen (als nodig)
CREATE POLICY "Users can view active ingredient subgroups"
  ON public.ingredient_subgroups
  FOR SELECT
  USING (is_active = true);

COMMIT;
