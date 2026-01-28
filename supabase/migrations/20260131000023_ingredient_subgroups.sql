-- Migration: Ingredient Subgroups System
-- Created: 2026-01-31
-- Description: Add subgroepen (subgroups) support to ingredient categories
-- Allows organizing items within a category into logical subgroups (e.g., "pasta" subgroup within "gluten_containing_grains")

-- ============================================================================
-- Table: ingredient_subgroups
-- ============================================================================
-- Subgroepen binnen een ingrediënt categorie
-- Bijv. "pasta", "wheat products" binnen "gluten_containing_grains"

CREATE TABLE IF NOT EXISTS public.ingredient_subgroups (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.ingredient_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Bijv. "pasta", "wheat products"
  name_nl TEXT, -- Nederlandse naam (bijv. "pasta", "tarweproducten")
  description TEXT, -- Optionele beschrijving
  display_order INTEGER NOT NULL DEFAULT 0, -- Voor sortering in UI
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure unique subgroup name per category
  UNIQUE(category_id, name)
);

-- Indexen
CREATE INDEX IF NOT EXISTS idx_ingredient_subgroups_category_id ON public.ingredient_subgroups(category_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_subgroups_name ON public.ingredient_subgroups(name);
CREATE INDEX IF NOT EXISTS idx_ingredient_subgroups_active ON public.ingredient_subgroups(is_active);

-- ============================================================================
-- Update ingredient_category_items to support subgroups
-- ============================================================================
-- Items kunnen nu direct aan categorie hangen (backward compatible) OF aan subgroep
-- CONSTRAINT: item moet category_id hebben, en optioneel subgroup_id

ALTER TABLE public.ingredient_category_items
  ADD COLUMN IF NOT EXISTS subgroup_id UUID REFERENCES public.ingredient_subgroups(id) ON DELETE CASCADE;

-- Index voor subgroup_id
CREATE INDEX IF NOT EXISTS idx_category_items_subgroup_id ON public.ingredient_category_items(subgroup_id);

-- Constraint: Als subgroup_id is gezet, moet het category_id matchen met de subgroep's category_id
-- Dit voorkomt inconsistenties
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

-- Drop trigger if it exists before creating (idempotent)
DROP TRIGGER IF EXISTS check_subgroup_category_match_trigger ON public.ingredient_category_items;

CREATE TRIGGER check_subgroup_category_match_trigger
  BEFORE INSERT OR UPDATE ON public.ingredient_category_items
  FOR EACH ROW
  EXECUTE FUNCTION check_subgroup_category_match();

-- ============================================================================
-- Update unique constraint for ingredient_category_items
-- ============================================================================
-- Items moeten uniek zijn per (category_id, term) OF per (subgroup_id, term)
-- Maar niet beide tegelijk

-- Drop existing unique constraint if it exists
ALTER TABLE public.ingredient_category_items
  DROP CONSTRAINT IF EXISTS ingredient_category_items_category_id_term_key;

-- Create new unique constraint: unique per category OR per subgroup
-- We gebruiken een partial unique index voor dit
CREATE UNIQUE INDEX IF NOT EXISTS ingredient_category_items_category_term_unique
  ON public.ingredient_category_items(category_id, term)
  WHERE subgroup_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ingredient_category_items_subgroup_term_unique
  ON public.ingredient_category_items(subgroup_id, term)
  WHERE subgroup_id IS NOT NULL;

-- ============================================================================
-- Triggers voor updated_at
-- ============================================================================

-- Drop trigger if it exists before creating (idempotent)
DROP TRIGGER IF EXISTS set_updated_at_ingredient_subgroups ON public.ingredient_subgroups;

CREATE TRIGGER set_updated_at_ingredient_subgroups
  BEFORE UPDATE ON public.ingredient_subgroups
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- ============================================================================
-- RLS Policies
-- ============================================================================
-- Alleen admins kunnen subgroepen beheren

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

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.ingredient_subgroups IS 'Subgroepen binnen ingrediënt categorieën voor betere organisatie';
COMMENT ON COLUMN public.ingredient_subgroups.category_id IS 'De categorie waar deze subgroep bij hoort';
COMMENT ON COLUMN public.ingredient_subgroups.name IS 'Engelse naam van de subgroep (bijv. "pasta", "wheat products")';
COMMENT ON COLUMN public.ingredient_subgroups.name_nl IS 'Nederlandse naam van de subgroep';
COMMENT ON COLUMN public.ingredient_subgroups.display_order IS 'Volgorde voor weergave in UI (lager = eerder)';
COMMENT ON COLUMN public.ingredient_category_items.subgroup_id IS 'Optionele subgroep waar dit item bij hoort. Als NULL, hoort item direct bij categorie';
