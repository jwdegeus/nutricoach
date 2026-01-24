-- Migration: NEVO Food Database Integration
-- Created: 2025-01-24
-- Description: Tabellen voor NEVO voedingsmiddelen database voor nutriëntenberekening

-- ============================================================================
-- Table: nevo_foods
-- ============================================================================
-- Hoofdtabel met alle voedingsmiddelen en hun nutriëntenwaarden (per 100g)
-- Gebaseerd op NEVO-Online 2025 v9.0 dataset

CREATE TABLE IF NOT EXISTS public.nevo_foods (
  id SERIAL PRIMARY KEY,
  nevo_version TEXT NOT NULL,
  nevo_code INTEGER NOT NULL UNIQUE,
  food_group_nl TEXT NOT NULL,
  food_group_en TEXT NOT NULL,
  name_nl TEXT NOT NULL,
  name_en TEXT NOT NULL,
  synonym TEXT,
  quantity TEXT NOT NULL DEFAULT 'per 100g',
  note TEXT,
  contains_traces_of TEXT,
  is_fortified_with TEXT,
  
  -- Energie en macronutriënten
  energy_kj NUMERIC(10, 2),
  energy_kcal NUMERIC(10, 2),
  water_g NUMERIC(10, 2),
  protein_g NUMERIC(10, 2),
  protein_pl_g NUMERIC(10, 2),
  protein_drl_g NUMERIC(10, 2),
  nitrogen_g NUMERIC(10, 2),
  tryptophan_mg NUMERIC(10, 2),
  fat_g NUMERIC(10, 2),
  fatty_acids_g NUMERIC(10, 2),
  saturated_fat_g NUMERIC(10, 2),
  monounsaturated_fat_g NUMERIC(10, 2),
  polyunsaturated_fat_g NUMERIC(10, 2),
  omega3_fat_g NUMERIC(10, 2),
  omega6_fat_g NUMERIC(10, 2),
  trans_fat_g NUMERIC(10, 2),
  carbs_g NUMERIC(10, 2),
  sugar_g NUMERIC(10, 2),
  free_sugars_g NUMERIC(10, 2),
  starch_g NUMERIC(10, 2),
  polyols_g NUMERIC(10, 2),
  fiber_g NUMERIC(10, 2),
  alcohol_g NUMERIC(10, 2),
  organic_acids_g NUMERIC(10, 2),
  ash_g NUMERIC(10, 2),
  
  -- Mineralen en spoorelementen
  cholesterol_mg NUMERIC(10, 2),
  sodium_mg NUMERIC(10, 2),
  potassium_mg NUMERIC(10, 2),
  calcium_mg NUMERIC(10, 2),
  phosphorus_mg NUMERIC(10, 2),
  magnesium_mg NUMERIC(10, 2),
  iron_mg NUMERIC(10, 2),
  iron_haem_mg NUMERIC(10, 2),
  iron_non_haem_mg NUMERIC(10, 2),
  copper_mg NUMERIC(10, 2),
  selenium_ug NUMERIC(10, 2),
  zinc_mg NUMERIC(10, 2),
  iodine_ug NUMERIC(10, 2),
  
  -- Vitamines (vetoplosbaar)
  vit_a_rae_ug NUMERIC(10, 2),
  vit_a_re_ug NUMERIC(10, 2),
  retinol_ug NUMERIC(10, 2),
  beta_carotene_total_ug NUMERIC(10, 2),
  alpha_carotene_ug NUMERIC(10, 2),
  lutein_ug NUMERIC(10, 2),
  zeaxanthin_ug NUMERIC(10, 2),
  beta_cryptoxanthin_ug NUMERIC(10, 2),
  lycopene_ug NUMERIC(10, 2),
  vit_d_ug NUMERIC(10, 2),
  vit_d3_ug NUMERIC(10, 2),
  vit_d2_ug NUMERIC(10, 2),
  vit_e_mg NUMERIC(10, 2),
  alpha_tocopherol_mg NUMERIC(10, 2),
  beta_tocopherol_mg NUMERIC(10, 2),
  delta_tocopherol_mg NUMERIC(10, 2),
  gamma_tocopherol_mg NUMERIC(10, 2),
  vit_k_ug NUMERIC(10, 2),
  vit_k1_ug NUMERIC(10, 2),
  vit_k2_ug NUMERIC(10, 2),
  
  -- Vitamines (wateroplosbaar)
  vit_b1_mg NUMERIC(10, 2),
  vit_b2_mg NUMERIC(10, 2),
  vit_b6_mg NUMERIC(10, 2),
  vit_b12_ug NUMERIC(10, 2),
  niacin_equiv_mg NUMERIC(10, 2),
  niacin_mg NUMERIC(10, 2),
  folate_equiv_ug NUMERIC(10, 2),
  folate_ug NUMERIC(10, 2),
  folic_acid_ug NUMERIC(10, 2),
  vit_c_mg NUMERIC(10, 2),
  
  -- Gedetailleerde vetzuren (optioneel, voor toekomstige uitbreiding)
  -- We slaan alleen de belangrijkste op, volledige lijst kan later worden toegevoegd
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexen voor snelle zoekopdrachten
CREATE INDEX IF NOT EXISTS idx_nevo_foods_nevo_code ON public.nevo_foods(nevo_code);
CREATE INDEX IF NOT EXISTS idx_nevo_foods_name_nl ON public.nevo_foods USING gin(to_tsvector('dutch', name_nl));
CREATE INDEX IF NOT EXISTS idx_nevo_foods_name_en ON public.nevo_foods USING gin(to_tsvector('english', name_en));
CREATE INDEX IF NOT EXISTS idx_nevo_foods_food_group_nl ON public.nevo_foods(food_group_nl);
CREATE INDEX IF NOT EXISTS idx_nevo_foods_food_group_en ON public.nevo_foods(food_group_en);

-- ============================================================================
-- Table: meal_ingredients
-- ============================================================================
-- Koppelt ingrediënten aan maaltijden met hoeveelheden
-- Voor toekomstige meal planner functionaliteit

CREATE TABLE IF NOT EXISTS public.meal_ingredients (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID, -- Referentie naar toekomstige meals tabel
  nevo_food_id INTEGER NOT NULL REFERENCES public.nevo_foods(id) ON DELETE CASCADE,
  amount_g NUMERIC(10, 2) NOT NULL, -- Hoeveelheid in grammen
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_ingredients_meal_id ON public.meal_ingredients(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_ingredients_nevo_food_id ON public.meal_ingredients(nevo_food_id);

-- ============================================================================
-- Table: nevo_recipe_ingredients
-- ============================================================================
-- Bevat recepten: samengestelde voedingsmiddelen die bestaan uit andere voedingsmiddelen
-- Gebaseerd op NEVO2025_v9.0_Recepten_Recipes.csv

CREATE TABLE IF NOT EXISTS public.nevo_recipe_ingredients (
  id SERIAL PRIMARY KEY,
  nevo_version TEXT NOT NULL,
  recipe_nevo_code INTEGER NOT NULL, -- NEVO code van het recept (samengesteld voedingsmiddel)
  recipe_name_nl TEXT,
  recipe_name_en TEXT,
  ingredient_nevo_code INTEGER NOT NULL, -- NEVO code van het ingrediënt
  ingredient_name_nl TEXT,
  ingredient_name_en TEXT,
  relative_amount NUMERIC(10, 2) NOT NULL, -- Relatieve hoeveelheid (percentage)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign keys worden later toegevoegd na import om import volgorde flexibel te houden
-- ALTER TABLE public.nevo_recipe_ingredients
--   ADD CONSTRAINT fk_recipe_nevo_code FOREIGN KEY (recipe_nevo_code) REFERENCES public.nevo_foods(nevo_code) ON DELETE CASCADE,
--   ADD CONSTRAINT fk_ingredient_nevo_code FOREIGN KEY (ingredient_nevo_code) REFERENCES public.nevo_foods(nevo_code) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_code ON public.nevo_recipe_ingredients(recipe_nevo_code);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient_code ON public.nevo_recipe_ingredients(ingredient_nevo_code);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_ingredient ON public.nevo_recipe_ingredients(recipe_nevo_code, ingredient_nevo_code);

-- ============================================================================
-- Table: nevo_nutrients
-- ============================================================================
-- Lookup tabel met nutriënt definities
-- Gebaseerd op NEVO2025_v9.0_Nutrienten_Nutrients.csv

CREATE TABLE IF NOT EXISTS public.nevo_nutrients (
  id SERIAL PRIMARY KEY,
  nutrient_group_nl TEXT NOT NULL,
  nutrient_group_en TEXT NOT NULL,
  nutrient_code TEXT NOT NULL UNIQUE,
  nutrient_name_nl TEXT NOT NULL,
  nutrient_name_en TEXT NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nevo_nutrients_code ON public.nevo_nutrients(nutrient_code);
CREATE INDEX IF NOT EXISTS idx_nevo_nutrients_group_nl ON public.nevo_nutrients(nutrient_group_nl);
CREATE INDEX IF NOT EXISTS idx_nevo_nutrients_group_en ON public.nevo_nutrients(nutrient_group_en);

-- ============================================================================
-- Table: nevo_references
-- ============================================================================
-- Referenties en broncodes voor nutriëntenwaarden
-- Gebaseerd op NEVO2025_v9.0_Referenties_References.csv

CREATE TABLE IF NOT EXISTS public.nevo_references (
  id SERIAL PRIMARY KEY,
  source_code TEXT NOT NULL UNIQUE,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nevo_references_source_code ON public.nevo_references(source_code);

-- ============================================================================
-- Function: calculate_meal_nutrition
-- ============================================================================
-- Functie om nutriëntenwaarden te berekenen voor een maaltijd
-- Gebruikt meal_ingredients om alle ingrediënten op te halen en te aggregeren

CREATE OR REPLACE FUNCTION public.calculate_meal_nutrition(p_meal_id UUID)
RETURNS TABLE (
  energy_kj NUMERIC,
  energy_kcal NUMERIC,
  water_g NUMERIC,
  protein_g NUMERIC,
  fat_g NUMERIC,
  saturated_fat_g NUMERIC,
  monounsaturated_fat_g NUMERIC,
  polyunsaturated_fat_g NUMERIC,
  omega3_fat_g NUMERIC,
  omega6_fat_g NUMERIC,
  trans_fat_g NUMERIC,
  carbs_g NUMERIC,
  sugar_g NUMERIC,
  free_sugars_g NUMERIC,
  starch_g NUMERIC,
  fiber_g NUMERIC,
  alcohol_g NUMERIC,
  cholesterol_mg NUMERIC,
  sodium_mg NUMERIC,
  potassium_mg NUMERIC,
  calcium_mg NUMERIC,
  phosphorus_mg NUMERIC,
  magnesium_mg NUMERIC,
  iron_mg NUMERIC,
  copper_mg NUMERIC,
  selenium_ug NUMERIC,
  zinc_mg NUMERIC,
  iodine_ug NUMERIC,
  vit_a_rae_ug NUMERIC,
  vit_d_ug NUMERIC,
  vit_e_mg NUMERIC,
  vit_k_ug NUMERIC,
  vit_b1_mg NUMERIC,
  vit_b2_mg NUMERIC,
  vit_b6_mg NUMERIC,
  vit_b12_ug NUMERIC,
  niacin_equiv_mg NUMERIC,
  folate_equiv_ug NUMERIC,
  vit_c_mg NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    SUM(nf.energy_kj * (mi.amount_g / 100.0)) AS energy_kj,
    SUM(nf.energy_kcal * (mi.amount_g / 100.0)) AS energy_kcal,
    SUM(nf.water_g * (mi.amount_g / 100.0)) AS water_g,
    SUM(nf.protein_g * (mi.amount_g / 100.0)) AS protein_g,
    SUM(nf.fat_g * (mi.amount_g / 100.0)) AS fat_g,
    SUM(nf.saturated_fat_g * (mi.amount_g / 100.0)) AS saturated_fat_g,
    SUM(nf.monounsaturated_fat_g * (mi.amount_g / 100.0)) AS monounsaturated_fat_g,
    SUM(nf.polyunsaturated_fat_g * (mi.amount_g / 100.0)) AS polyunsaturated_fat_g,
    SUM(nf.omega3_fat_g * (mi.amount_g / 100.0)) AS omega3_fat_g,
    SUM(nf.omega6_fat_g * (mi.amount_g / 100.0)) AS omega6_fat_g,
    SUM(nf.trans_fat_g * (mi.amount_g / 100.0)) AS trans_fat_g,
    SUM(nf.carbs_g * (mi.amount_g / 100.0)) AS carbs_g,
    SUM(nf.sugar_g * (mi.amount_g / 100.0)) AS sugar_g,
    SUM(nf.free_sugars_g * (mi.amount_g / 100.0)) AS free_sugars_g,
    SUM(nf.starch_g * (mi.amount_g / 100.0)) AS starch_g,
    SUM(nf.fiber_g * (mi.amount_g / 100.0)) AS fiber_g,
    SUM(nf.alcohol_g * (mi.amount_g / 100.0)) AS alcohol_g,
    SUM(nf.cholesterol_mg * (mi.amount_g / 100.0)) AS cholesterol_mg,
    SUM(nf.sodium_mg * (mi.amount_g / 100.0)) AS sodium_mg,
    SUM(nf.potassium_mg * (mi.amount_g / 100.0)) AS potassium_mg,
    SUM(nf.calcium_mg * (mi.amount_g / 100.0)) AS calcium_mg,
    SUM(nf.phosphorus_mg * (mi.amount_g / 100.0)) AS phosphorus_mg,
    SUM(nf.magnesium_mg * (mi.amount_g / 100.0)) AS magnesium_mg,
    SUM(nf.iron_mg * (mi.amount_g / 100.0)) AS iron_mg,
    SUM(nf.copper_mg * (mi.amount_g / 100.0)) AS copper_mg,
    SUM(nf.selenium_ug * (mi.amount_g / 100.0)) AS selenium_ug,
    SUM(nf.zinc_mg * (mi.amount_g / 100.0)) AS zinc_mg,
    SUM(nf.iodine_ug * (mi.amount_g / 100.0)) AS iodine_ug,
    SUM(nf.vit_a_rae_ug * (mi.amount_g / 100.0)) AS vit_a_rae_ug,
    SUM(nf.vit_d_ug * (mi.amount_g / 100.0)) AS vit_d_ug,
    SUM(nf.vit_e_mg * (mi.amount_g / 100.0)) AS vit_e_mg,
    SUM(nf.vit_k_ug * (mi.amount_g / 100.0)) AS vit_k_ug,
    SUM(nf.vit_b1_mg * (mi.amount_g / 100.0)) AS vit_b1_mg,
    SUM(nf.vit_b2_mg * (mi.amount_g / 100.0)) AS vit_b2_mg,
    SUM(nf.vit_b6_mg * (mi.amount_g / 100.0)) AS vit_b6_mg,
    SUM(nf.vit_b12_ug * (mi.amount_g / 100.0)) AS vit_b12_ug,
    SUM(nf.niacin_equiv_mg * (mi.amount_g / 100.0)) AS niacin_equiv_mg,
    SUM(nf.folate_equiv_ug * (mi.amount_g / 100.0)) AS folate_equiv_ug,
    SUM(nf.vit_c_mg * (mi.amount_g / 100.0)) AS vit_c_mg
  FROM public.meal_ingredients mi
  INNER JOIN public.nevo_foods nf ON mi.nevo_food_id = nf.id
  WHERE mi.meal_id = p_meal_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers voor updated_at
-- ============================================================================

CREATE TRIGGER set_updated_at_nevo_foods
  BEFORE UPDATE ON public.nevo_foods
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_meal_ingredients
  BEFORE UPDATE ON public.meal_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_nevo_recipe_ingredients
  BEFORE UPDATE ON public.nevo_recipe_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_nevo_nutrients
  BEFORE UPDATE ON public.nevo_nutrients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_nevo_references
  BEFORE UPDATE ON public.nevo_references
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
-- NEVO data is publiek beschikbaar, maar we kunnen RLS inschakelen voor meal_ingredients

ALTER TABLE public.nevo_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nevo_recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nevo_nutrients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nevo_references ENABLE ROW LEVEL SECURITY;

-- NEVO data is publiek leesbaar
CREATE POLICY "NEVO foods are publicly readable"
  ON public.nevo_foods
  FOR SELECT
  USING (true);

CREATE POLICY "Meal ingredients are publicly readable"
  ON public.meal_ingredients
  FOR SELECT
  USING (true);

CREATE POLICY "NEVO recipe ingredients are publicly readable"
  ON public.nevo_recipe_ingredients
  FOR SELECT
  USING (true);

CREATE POLICY "NEVO nutrients are publicly readable"
  ON public.nevo_nutrients
  FOR SELECT
  USING (true);

CREATE POLICY "NEVO references are publicly readable"
  ON public.nevo_references
  FOR SELECT
  USING (true);
