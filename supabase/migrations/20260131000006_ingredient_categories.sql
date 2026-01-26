-- Migration: Ingredient Categories System
-- Created: 2026-01-31
-- Description: Database-driven ingredient categories system for guard rails
-- NO HARDCODED CATEGORIES - alles komt uit de database

-- ============================================================================
-- Table: ingredient_categories
-- ============================================================================
-- Master tabel voor alle ingredient categorieën (verboden en vereiste)
-- Admins kunnen nieuwe categorieën toevoegen zonder code changes

CREATE TABLE IF NOT EXISTS public.ingredient_categories (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, -- Bijv. "dairy", "gluten_containing_grains", "leafy_vegetables"
  name_nl TEXT NOT NULL, -- Nederlandse naam: "Zuivel", "Glutenhoudende granen", "Bladgroenten"
  name_en TEXT, -- Optionele Engelse naam
  description TEXT, -- Beschrijving van de categorie
  category_type TEXT NOT NULL CHECK (category_type IN ('forbidden', 'required')), -- Type categorie
  parent_category_id UUID REFERENCES public.ingredient_categories(id) ON DELETE SET NULL, -- Voor hiërarchie (bijv. "grains" -> "gluten_containing_grains")
  display_order INTEGER NOT NULL DEFAULT 0, -- Voor sortering in UI
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexen
CREATE INDEX IF NOT EXISTS idx_ingredient_categories_code ON public.ingredient_categories(code);
CREATE INDEX IF NOT EXISTS idx_ingredient_categories_type ON public.ingredient_categories(category_type);
CREATE INDEX IF NOT EXISTS idx_ingredient_categories_active ON public.ingredient_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_ingredient_categories_parent ON public.ingredient_categories(parent_category_id);

-- ============================================================================
-- Table: ingredient_category_items
-- ============================================================================
-- Specifieke ingrediënten die tot een categorie behoren
-- Bijv. "pasta", "spaghetti", "orzo" behoren tot "gluten_containing_grains"

CREATE TABLE IF NOT EXISTS public.ingredient_category_items (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.ingredient_categories(id) ON DELETE CASCADE,
  term TEXT NOT NULL, -- Het ingrediënt (bijv. "pasta", "orzo", "spinach")
  term_nl TEXT, -- Nederlandse term (bijv. "pasta", "orzo", "spinazie")
  synonyms JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array van synoniemen
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure unique term per category
  UNIQUE(category_id, term)
);

-- Indexen
CREATE INDEX IF NOT EXISTS idx_category_items_category_id ON public.ingredient_category_items(category_id);
CREATE INDEX IF NOT EXISTS idx_category_items_term ON public.ingredient_category_items(term);
CREATE INDEX IF NOT EXISTS idx_category_items_active ON public.ingredient_category_items(is_active);

-- ============================================================================
-- Table: diet_category_constraints
-- ============================================================================
-- Koppelt diëten aan categorieën (verboden of vereist)
-- Dit vervangt de hardcoded categorieën in diet_rules

CREATE TABLE IF NOT EXISTS public.diet_category_constraints (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_type_id UUID NOT NULL REFERENCES public.diet_types(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.ingredient_categories(id) ON DELETE CASCADE,
  constraint_type TEXT NOT NULL CHECK (constraint_type IN ('forbidden', 'required')), -- Moet matchen met category.category_type
  strictness TEXT NOT NULL DEFAULT 'hard' CHECK (strictness IN ('hard', 'soft')), -- hard = strikt verboden/vereist, soft = voorkeur
  min_per_day INTEGER, -- Voor required categories: minimum aantal per dag
  min_per_week INTEGER, -- Voor required categories: minimum aantal per week
  priority INTEGER NOT NULL DEFAULT 50, -- Prioriteit (hogere = belangrijker, guard rails zijn 90+)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure unique constraint per diet and category
  UNIQUE(diet_type_id, category_id)
);

-- Indexen
CREATE INDEX IF NOT EXISTS idx_diet_category_constraints_diet_type_id ON public.diet_category_constraints(diet_type_id);
CREATE INDEX IF NOT EXISTS idx_diet_category_constraints_category_id ON public.diet_category_constraints(category_id);
CREATE INDEX IF NOT EXISTS idx_diet_category_constraints_type ON public.diet_category_constraints(constraint_type);
CREATE INDEX IF NOT EXISTS idx_diet_category_constraints_active ON public.diet_category_constraints(is_active);

-- ============================================================================
-- Triggers voor updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_ingredient_categories
  BEFORE UPDATE ON public.ingredient_categories
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_updated_at_ingredient_category_items
  BEFORE UPDATE ON public.ingredient_category_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_updated_at_diet_category_constraints
  BEFORE UPDATE ON public.diet_category_constraints
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- ingredient_categories: Public read (is_active = true), admin write
ALTER TABLE public.ingredient_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active ingredient categories"
  ON public.ingredient_categories
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage ingredient categories"
  ON public.ingredient_categories
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- ingredient_category_items: Public read (is_active = true), admin write
ALTER TABLE public.ingredient_category_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active category items"
  ON public.ingredient_category_items
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage category items"
  ON public.ingredient_category_items
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- diet_category_constraints: Public read (is_active = true), admin write
ALTER TABLE public.diet_category_constraints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active diet category constraints"
  ON public.diet_category_constraints
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage diet category constraints"
  ON public.diet_category_constraints
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- Seed Data: Basis categorieën
-- ============================================================================
-- Deze seed data kan later door admins worden aangepast/uitgebreid

-- Verboden categorieën
INSERT INTO public.ingredient_categories (code, name_nl, name_en, description, category_type, display_order) VALUES
  ('dairy', 'Zuivel', 'Dairy', 'Melk, kaas, yoghurt, boter en andere zuivelproducten', 'forbidden', 1),
  ('gluten_containing_grains', 'Glutenhoudende granen', 'Gluten-containing grains', 'Tarwe, gerst, rogge, spelt en producten hiervan (pasta, brood, etc.)', 'forbidden', 2),
  ('legumes', 'Peulvruchten', 'Legumes', 'Bonen, linzen, kikkererwten, erwten, soja', 'forbidden', 3),
  ('nightshades', 'Nachtschades', 'Nightshades', 'Tomaat, aardappel, aubergine, paprika, chili', 'forbidden', 4),
  ('processed_sugar', 'Bewerkte suiker', 'Processed sugar', 'Witte suiker, rietsuiker, siroop, honing (afhankelijk van dieet)', 'forbidden', 5),
  ('nuts', 'Noten', 'Nuts', 'Amandelen, walnoten, cashewnoten, etc.', 'forbidden', 6),
  ('eggs', 'Eieren', 'Eggs', 'Kippeneieren en andere eieren', 'forbidden', 7),
  ('shellfish', 'Schaaldieren', 'Shellfish', 'Garnalen, krab, kreeft, mosselen', 'forbidden', 8),
  ('alcohol', 'Alcohol', 'Alcohol', 'Wijn, bier, sterke drank', 'forbidden', 9)
ON CONFLICT (code) DO NOTHING;

-- Vereiste categorieën
INSERT INTO public.ingredient_categories (code, name_nl, name_en, description, category_type, display_order) VALUES
  ('leafy_vegetables', 'Bladgroenten', 'Leafy vegetables', 'Spinazie, boerenkool, sla, snijbiet, etc.', 'required', 1),
  ('sulfur_vegetables', 'Zwavelrijke groenten', 'Sulfur vegetables', 'Broccoli, bloemkool, kool, spruitjes, ui, knoflook', 'required', 2),
  ('colored_vegetables', 'Gekleurde groenten', 'Colored vegetables', 'Wortel, biet, paprika, zoete aardappel, pompoen', 'required', 3),
  ('organ_meats', 'Orgaanvlees', 'Organ meats', 'Lever, hart, nier, tong', 'required', 4),
  ('seaweed', 'Zeewier', 'Seaweed', 'Nori, kelp, wakame, kombu', 'required', 5),
  ('fermented_foods', 'Gefermenteerd voedsel', 'Fermented foods', 'Zuurkool, kimchi, kefir, yoghurt (afhankelijk van dieet)', 'required', 6)
ON CONFLICT (code) DO NOTHING;

-- Seed voorbeelden van category items (gluten_containing_grains)
INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
SELECT 
  ic.id,
  'pasta',
  'pasta',
  '["spaghetti", "penne", "fusilli", "macaroni", "orzo", "risoni", "couscous", "noedels", "tagliatelle", "fettuccine", "linguine", "ravioli", "lasagne", "gnocchi"]'::jsonb,
  1
FROM public.ingredient_categories ic
WHERE ic.code = 'gluten_containing_grains'
ON CONFLICT (category_id, term) DO NOTHING;

INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
SELECT 
  ic.id,
  'wheat',
  'tarwe',
  '["tarwe", "tarwebloem", "tarwemeel", "bloem", "meel"]'::jsonb,
  2
FROM public.ingredient_categories ic
WHERE ic.code = 'gluten_containing_grains'
ON CONFLICT (category_id, term) DO NOTHING;

-- Seed voorbeelden voor dairy
INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
SELECT 
  ic.id,
  'milk',
  'melk',
  '["koemelk", "volle melk", "halfvolle melk", "magere melk"]'::jsonb,
  1
FROM public.ingredient_categories ic
WHERE ic.code = 'dairy'
ON CONFLICT (category_id, term) DO NOTHING;

-- Seed voorbeelden voor leafy_vegetables
INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
SELECT 
  ic.id,
  'spinach',
  'spinazie',
  '[]'::jsonb,
  1
FROM public.ingredient_categories ic
WHERE ic.code = 'leafy_vegetables'
ON CONFLICT (category_id, term) DO NOTHING;

INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
SELECT 
  ic.id,
  'kale',
  'boerenkool',
  '[]'::jsonb,
  2
FROM public.ingredient_categories ic
WHERE ic.code = 'leafy_vegetables'
ON CONFLICT (category_id, term) DO NOTHING;
