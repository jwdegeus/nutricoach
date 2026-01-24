-- Migration: Diet Types en Diet Rules
-- Created: 2024-12-02
-- Description: Tabellen voor dieettypes en dieetregels voor mealplanning

-- ============================================================================
-- Table: diet_types
-- ============================================================================
-- Basis informatie over beschikbare dieettypes

CREATE TABLE IF NOT EXISTS public.diet_types (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  icon_name TEXT NULL, -- Voor toekomstige icon support
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index voor diet_types
CREATE INDEX IF NOT EXISTS idx_diet_types_is_active ON public.diet_types(is_active);
CREATE INDEX IF NOT EXISTS idx_diet_types_display_order ON public.diet_types(display_order);

-- ============================================================================
-- Table: diet_rules
-- ============================================================================
-- Regels per dieettype voor mealplanning validatie

CREATE TABLE IF NOT EXISTS public.diet_rules (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_type_id UUID NOT NULL REFERENCES public.diet_types(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL, -- 'exclude_ingredient', 'require_ingredient', 'macro_constraint', 'meal_structure'
  rule_key TEXT NOT NULL, -- Bijv. 'max_carbs_per_100g', 'excluded_category'
  rule_value JSONB NOT NULL, -- Flexibele waarde opslag
  description TEXT NULL, -- Human-readable beschrijving van de regel
  priority INTEGER NOT NULL DEFAULT 0, -- Voor regel prioriteit (hogere = belangrijker)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure unique rule per diet type
  UNIQUE(diet_type_id, rule_type, rule_key)
);

-- Indexen voor diet_rules
CREATE INDEX IF NOT EXISTS idx_diet_rules_diet_type_id ON public.diet_rules(diet_type_id);
CREATE INDEX IF NOT EXISTS idx_diet_rules_rule_type ON public.diet_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_diet_rules_is_active ON public.diet_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_diet_rules_diet_active ON public.diet_rules(diet_type_id, is_active);

-- ============================================================================
-- Foreign Key Update: user_diet_profiles
-- ============================================================================
-- Update de bestaande foreign key constraint (als die nog niet bestaat)

-- Check if foreign key already exists before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_diet_profiles_diet_type_id_fkey'
  ) THEN
    ALTER TABLE public.user_diet_profiles
    ADD CONSTRAINT user_diet_profiles_diet_type_id_fkey
    FOREIGN KEY (diet_type_id) REFERENCES public.diet_types(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- Triggers voor updated_at
-- ============================================================================

-- Triggers voor diet_types
CREATE TRIGGER set_updated_at_diet_types
  BEFORE UPDATE ON public.diet_types
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Triggers voor diet_rules
CREATE TRIGGER set_updated_at_diet_rules
  BEFORE UPDATE ON public.diet_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Seed Data: Basis dieettypes
-- ============================================================================

INSERT INTO public.diet_types (name, description, display_order) VALUES
  ('Geen specifiek dieet', 'Geen specifieke dieetbeperkingen', 0),
  ('Vegetarisch', 'Geen vlees of vis, wel zuivel en eieren', 1),
  ('Veganistisch', 'Geen dierlijke producten', 2),
  ('Keto', 'Koolhydraatarm dieet met hoge vetinname', 3),
  ('Paleo', 'Voeding zoals in het paleolithische tijdperk', 4),
  ('Mediterraan', 'Gebaseerd op traditionele mediterrane voeding', 5),
  ('Low-carb', 'Beperkte koolhydraatinname', 6),
  ('Glutenvrij', 'Geen glutenbevattende producten', 7)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Seed Data: Voorbeeld dieetregels
-- ============================================================================

-- Vegetarisch: exclude vlees en vis
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_categories',
  '["vlees", "vis", "gevogelte"]'::jsonb,
  'Geen vlees, vis of gevogelte',
  10
FROM public.diet_types dt
WHERE dt.name = 'Vegetarisch'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO NOTHING;

-- Veganistisch: exclude alle dierlijke producten
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_categories',
  '["vlees", "vis", "gevogelte", "zuivel", "eieren", "honing"]'::jsonb,
  'Geen dierlijke producten',
  10
FROM public.diet_types dt
WHERE dt.name = 'Veganistisch'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO NOTHING;

-- Keto: macro constraints
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'macro_constraint',
  'max_carbs_per_100g',
  '5'::jsonb,
  'Maximaal 5g koolhydraten per 100g',
  10
FROM public.diet_types dt
WHERE dt.name = 'Keto'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO NOTHING;

INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'macro_constraint',
  'daily_carb_limit',
  '20'::jsonb,
  'Maximaal 20g koolhydraten per dag',
  10
FROM public.diet_types dt
WHERE dt.name = 'Keto'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO NOTHING;

-- Glutenvrij: exclude gluten
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_ingredients',
  '["tarwe", "gerst", "rogge", "spelt", "kamut"]'::jsonb,
  'Geen glutenbevattende granen',
  10
FROM public.diet_types dt
WHERE dt.name = 'Glutenvrij'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO NOTHING;

-- Low-carb: macro constraint
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'macro_constraint',
  'daily_carb_limit',
  '100'::jsonb,
  'Maximaal 100g koolhydraten per dag',
  10
FROM public.diet_types dt
WHERE dt.name = 'Low-carb'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO NOTHING;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- diet_types: Public read, admin write (voor nu: everyone can read)
ALTER TABLE public.diet_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active diet types"
  ON public.diet_types
  FOR SELECT
  USING (is_active = true);

-- diet_rules: Public read, admin write
ALTER TABLE public.diet_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active diet rules"
  ON public.diet_rules
  FOR SELECT
  USING (is_active = true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Functie om alle actieve dieettypes op te halen (gesorteerd op display_order)
CREATE OR REPLACE FUNCTION public.get_active_diet_types()
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  display_order INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dt.id,
    dt.name,
    dt.description,
    dt.display_order
  FROM public.diet_types dt
  WHERE dt.is_active = true
  ORDER BY dt.display_order ASC, dt.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Functie om regels voor een dieettype op te halen
CREATE OR REPLACE FUNCTION public.get_diet_rules(p_diet_type_id UUID)
RETURNS TABLE (
  rule_type TEXT,
  rule_key TEXT,
  rule_value JSONB,
  description TEXT,
  priority INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dr.rule_type,
    dr.rule_key,
    dr.rule_value,
    dr.description,
    dr.priority
  FROM public.diet_rules dr
  WHERE dr.diet_type_id = p_diet_type_id
    AND dr.is_active = true
  ORDER BY dr.priority DESC, dr.rule_type ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
