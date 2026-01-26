-- Migration: Recipe Adaptation Rules
-- Created: 2026-01-31
-- Description: Tabel voor recipe adaptation rules die admins kunnen bewerken

-- ============================================================================
-- Table: recipe_adaptation_rules
-- ============================================================================
-- Regels voor recipe adaptation per dieettype
-- Deze regels bepalen welke ingrediënten verboden zijn en welke substituties
-- worden voorgesteld in de AI Magician tool

CREATE TABLE IF NOT EXISTS public.recipe_adaptation_rules (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_type_id UUID NOT NULL REFERENCES public.diet_types(id) ON DELETE CASCADE,
  term TEXT NOT NULL, -- Het verboden ingrediënt (bijv. "pasta", "melk")
  synonyms JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array van synoniemen (bijv. ["spaghetti", "penne", "orzo"])
  rule_code TEXT NOT NULL, -- Code voor de regel (bijv. "GLUTEN_FREE", "LACTOSE_FREE")
  rule_label TEXT NOT NULL, -- Human-readable label (bijv. "Glutenvrij dieet")
  substitution_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array van substitutie suggesties
  priority INTEGER NOT NULL DEFAULT 50, -- Prioriteit (hogere = belangrijker)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure unique term per diet type
  UNIQUE(diet_type_id, term)
);

-- Indexen voor recipe_adaptation_rules
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_rules_diet_type_id ON public.recipe_adaptation_rules(diet_type_id);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_rules_is_active ON public.recipe_adaptation_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_rules_diet_active ON public.recipe_adaptation_rules(diet_type_id, is_active);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_rules_rule_code ON public.recipe_adaptation_rules(rule_code);

-- ============================================================================
-- Table: recipe_adaptation_heuristics
-- ============================================================================
-- Heuristieken voor recipe adaptation (bijv. added sugar detection)

CREATE TABLE IF NOT EXISTS public.recipe_adaptation_heuristics (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_type_id UUID NOT NULL REFERENCES public.diet_types(id) ON DELETE CASCADE,
  heuristic_type TEXT NOT NULL, -- Bijv. "added_sugar"
  terms JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array van termen om te detecteren
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure unique heuristic type per diet type
  UNIQUE(diet_type_id, heuristic_type)
);

-- Indexen voor recipe_adaptation_heuristics
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_heuristics_diet_type_id ON public.recipe_adaptation_heuristics(diet_type_id);
CREATE INDEX IF NOT EXISTS idx_recipe_adaptation_heuristics_is_active ON public.recipe_adaptation_heuristics(is_active);

-- ============================================================================
-- Triggers voor updated_at
-- ============================================================================

CREATE TRIGGER set_updated_at_recipe_adaptation_rules
  BEFORE UPDATE ON public.recipe_adaptation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_recipe_adaptation_heuristics
  BEFORE UPDATE ON public.recipe_adaptation_heuristics
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- recipe_adaptation_rules: Public read, admin write
ALTER TABLE public.recipe_adaptation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active recipe adaptation rules"
  ON public.recipe_adaptation_rules
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can insert recipe adaptation rules"
  ON public.recipe_adaptation_rules
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update recipe adaptation rules"
  ON public.recipe_adaptation_rules
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete recipe adaptation rules"
  ON public.recipe_adaptation_rules
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- recipe_adaptation_heuristics: Public read, admin write
ALTER TABLE public.recipe_adaptation_heuristics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active recipe adaptation heuristics"
  ON public.recipe_adaptation_heuristics
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can insert recipe adaptation heuristics"
  ON public.recipe_adaptation_heuristics
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update recipe adaptation heuristics"
  ON public.recipe_adaptation_heuristics
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete recipe adaptation heuristics"
  ON public.recipe_adaptation_heuristics
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- ============================================================================
-- Seed Data: Basis rules voor veelvoorkomende diëten
-- ============================================================================

-- Glutenvrij dieet: pasta
INSERT INTO public.recipe_adaptation_rules (diet_type_id, term, synonyms, rule_code, rule_label, substitution_suggestions, priority)
SELECT 
  dt.id,
  'pasta',
  '["spaghetti", "penne", "fusilli", "macaroni", "orzo", "risoni", "couscous", "noedels", "tagliatelle", "fettuccine", "linguine", "ravioli", "lasagne", "gnocchi"]'::jsonb,
  'GLUTEN_FREE',
  'Glutenvrij dieet',
  '["rijstnoedels", "zucchininoedels", "glutenvrije pasta", "quinoa pasta", "rijst"]'::jsonb,
  100
FROM public.diet_types dt
WHERE dt.name = 'Glutenvrij'
ON CONFLICT (diet_type_id, term) DO NOTHING;

-- Glutenvrij dieet: tarwebloem
INSERT INTO public.recipe_adaptation_rules (diet_type_id, term, synonyms, rule_code, rule_label, substitution_suggestions, priority)
SELECT 
  dt.id,
  'tarwebloem',
  '["tarwe", "wheat", "bloem", "meel", "tarwemeel"]'::jsonb,
  'GLUTEN_FREE',
  'Glutenvrij dieet',
  '["amandelmeel", "rijstmeel", "kokosmeel", "tapiocameel"]'::jsonb,
  100
FROM public.diet_types dt
WHERE dt.name = 'Glutenvrij'
ON CONFLICT (diet_type_id, term) DO NOTHING;

-- Veganistisch: melk
INSERT INTO public.recipe_adaptation_rules (diet_type_id, term, synonyms, rule_code, rule_label, substitution_suggestions, priority)
SELECT 
  dt.id,
  'melk',
  '["koemelk", "volle melk", "halfvolle melk", "magere melk"]'::jsonb,
  'LACTOSE_FREE',
  'Veganistisch dieet',
  '["amandelmelk", "havermelk", "kokosmelk", "rijstmelk", "sojamelk"]'::jsonb,
  100
FROM public.diet_types dt
WHERE dt.name = 'Veganistisch'
ON CONFLICT (diet_type_id, term) DO NOTHING;

-- Heuristieken: added sugar
INSERT INTO public.recipe_adaptation_heuristics (diet_type_id, heuristic_type, terms)
SELECT 
  dt.id,
  'added_sugar',
  '["suiker", "siroop", "stroop", "honing", "glucose", "fructose", "sucrose"]'::jsonb
FROM public.diet_types dt
WHERE dt.name IN ('Keto', 'Low-carb')
ON CONFLICT (diet_type_id, heuristic_type) DO NOTHING;
