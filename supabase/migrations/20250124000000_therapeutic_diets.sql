-- Migration: Therapeutic Diets with Strict Guard Rails
-- Created: 2025-01-24
-- Description: Adds therapeutic diet protocols with hard guard rails for chronic disease management

-- ============================================================================
-- Add therapeutic diet types
-- ============================================================================

INSERT INTO public.diet_types (name, description, display_order) VALUES
  ('Wahls Paleo', 'Therapeutic protocol for MS and autoimmune conditions. Requires 9 cups vegetables daily (3 leafy, 3 sulfur, 3 colored), organ meats 2x weekly, seaweed/kelp. Strictly forbids grains, dairy, legumes, processed sugar.', 10),
  ('Overcoming MS (OMS)', 'Plant-based protocol for multiple sclerosis. Requires 20-40ml flaxseed oil daily. Strictly forbids meat, dairy, egg yolks. Saturated fat must be < 10g per day.', 11),
  ('Autoimmune Protocol (AIP)', 'Elimination diet for autoimmune conditions. High nutrient density focus. Strictly forbids grains, dairy, legumes, nightshades, nuts, seeds, eggs, alcohol.', 12),
  ('Specific Carbohydrate Diet (SCD)', 'Monosaccharide-only protocol for IBD. Only honey allowed as sweetener. Strictly forbids starches, grains, potatoes, corn, soy, commercial yogurt (must be 24-hour fermented).', 13),
  ('Low Histamine', 'Histamine-restricted protocol. Requires fresh or flash-frozen meat. Strictly forbids fermented foods, aged cheese, canned fish, spinach, tomatoes, shellfish. Leftovers > 24h forbidden.', 14)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- WAHLS PALEO - Guard Rails
-- ============================================================================

-- Strictly Forbidden: All grains, all dairy, all legumes, processed sugar
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_categories',
  '["grains", "dairy", "legumes", "processed_sugar"]'::jsonb,
  'STRICTLY FORBIDDEN: All grains, all dairy, all legumes, processed sugar',
  100
FROM public.diet_types dt
WHERE dt.name = 'Wahls Paleo'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Strictly Required: Organ meats (liver/heart) 2x weekly
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'weekly_organ_meats',
  '{"requiredIngredients": ["liver", "heart"], "frequency": "2x_weekly", "minimumAmount": "2"}'::jsonb,
  'STRICTLY REQUIRED: Organ meats (liver/heart) 2x weekly for therapeutic efficacy',
  100
FROM public.diet_types dt
WHERE dt.name = 'Wahls Paleo'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Strictly Required: Seaweed/kelp
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'seaweed_required',
  '{"requiredIngredients": ["seaweed", "kelp", "nori", "dulse"], "frequency": "daily"}'::jsonb,
  'STRICTLY REQUIRED: Seaweed/kelp for therapeutic efficacy',
  100
FROM public.diet_types dt
WHERE dt.name = 'Wahls Paleo'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- 9 Cups Vegetables Algorithm: 3 leafy, 3 sulfur, 3 colored
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'meal_structure',
  'vegetable_cups_requirement',
  '{"totalCups": 9, "leafyCups": 3, "sulfurCups": 3, "coloredCups": 3, "leafyVegetables": ["spinach", "kale", "lettuce", "chard", "collard_greens", "arugula", "bok_choy"], "sulfurVegetables": ["broccoli", "cauliflower", "cabbage", "brussels_sprouts", "onion", "garlic", "leek"], "coloredVegetables": ["carrot", "beet", "bell_pepper", "sweet_potato", "pumpkin", "squash", "tomato"]}'::jsonb,
  'ALGORITHM: Must have 9 cups vegetables daily (3 leafy, 3 sulfur, 3 colored). If < 9 cups total, flag as INCOMPLETE',
  90
FROM public.diet_types dt
WHERE dt.name = 'Wahls Paleo'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- ============================================================================
-- OVERCOMING MS (OMS) - Guard Rails
-- ============================================================================

-- Strictly Forbidden: Meat (red/white), Dairy, Egg yolks
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_categories',
  '["meat", "red_meat", "white_meat", "poultry", "dairy", "egg_yolks"]'::jsonb,
  'STRICTLY FORBIDDEN: Meat (red/white), Dairy, Egg yolks',
  100
FROM public.diet_types dt
WHERE dt.name = 'Overcoming MS (OMS)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Upper Limit: Saturated fat MUST be < 10g per day
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'macro_constraint',
  'max_saturated_fat_daily',
  '{"maxSaturatedFatGrams": 10}'::jsonb,
  'GUARD RAIL: Saturated fat MUST be < 10g per day',
  100
FROM public.diet_types dt
WHERE dt.name = 'Overcoming MS (OMS)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Strictly Required: 20ml-40ml Flaxseed oil daily
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'daily_flaxseed_oil',
  '{"requiredIngredients": ["flaxseed_oil"], "frequency": "daily", "minAmountMl": 20, "maxAmountMl": 40}'::jsonb,
  'STRICTLY REQUIRED: 20ml-40ml Flaxseed oil daily for therapeutic efficacy',
  100
FROM public.diet_types dt
WHERE dt.name = 'Overcoming MS (OMS)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- ============================================================================
-- AUTOIMMUNE PROTOCOL (AIP) - Guard Rails
-- ============================================================================

-- Strictly Forbidden: Grains, Dairy, Legumes, Nightshades, Nuts, Seeds, Eggs, Alcohol
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_categories',
  '["grains", "dairy", "legumes", "nightshades", "nuts", "seeds", "eggs", "alcohol"]'::jsonb,
  'STRICTLY FORBIDDEN: Grains, Dairy, Legumes, Nightshades, Nuts, Seeds, Eggs, Alcohol',
  100
FROM public.diet_types dt
WHERE dt.name = 'Autoimmune Protocol (AIP)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Nightshade ingredients (specific list)
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_ingredients',
  '["tomato", "potato", "eggplant", "bell_pepper", "chili_pepper", "paprika", "cayenne", "goji_berry"]'::jsonb,
  'STRICTLY FORBIDDEN: Nightshade vegetables (Tomato, Potato, Eggplant, Peppers)',
  100
FROM public.diet_types dt
WHERE dt.name = 'Autoimmune Protocol (AIP)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Focus: High nutrient density (bone broth, wild fish)
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'high_nutrient_density',
  '{"recommendedIngredients": ["bone_broth", "wild_fish", "organ_meats", "leafy_greens"], "focus": "high_nutrient_density"}'::jsonb,
  'FOCUS: High nutrient density (bone broth, wild fish)',
  50
FROM public.diet_types dt
WHERE dt.name = 'Autoimmune Protocol (AIP)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- ============================================================================
-- SPECIFIC CARBOHYDRATE DIET (SCD) - Guard Rails
-- ============================================================================

-- Logic: Only monosaccharides allowed
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'macro_constraint',
  'carbohydrate_type',
  '{"allowedTypes": ["monosaccharides"], "forbiddenTypes": ["disaccharides", "polysaccharides", "starches"]}'::jsonb,
  'GUARD RAIL LOGIC: Only monosaccharides allowed',
  100
FROM public.diet_types dt
WHERE dt.name = 'Specific Carbohydrate Diet (SCD)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Strictly Forbidden: All starches, all grains, potatoes, corn, soy, commercial yogurt
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_categories',
  '["starches", "grains", "potatoes", "corn", "soy", "commercial_yogurt"]'::jsonb,
  'STRICTLY FORBIDDEN: All starches, all grains, potatoes, corn, soy, commercial yogurt (must be 24-hour fermented)',
  100
FROM public.diet_types dt
WHERE dt.name = 'Specific Carbohydrate Diet (SCD)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Permitted: Honey (as only sweetener)
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'allowed_sweetener',
  '{"allowedSweeteners": ["honey"], "forbiddenSweeteners": ["sugar", "maple_syrup", "agave", "artificial_sweeteners"]}'::jsonb,
  'PERMITTED: Honey (as only sweetener)',
  80
FROM public.diet_types dt
WHERE dt.name = 'Specific Carbohydrate Diet (SCD)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Permitted: Most fruits/veggies (non-starchy)
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'meal_structure',
  'permitted_foods',
  '{"permittedCategories": ["non_starchy_fruits", "non_starchy_vegetables"], "forbiddenCategories": ["starchy_vegetables"]}'::jsonb,
  'PERMITTED: Most fruits/veggies (non-starchy)',
  50
FROM public.diet_types dt
WHERE dt.name = 'Specific Carbohydrate Diet (SCD)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- ============================================================================
-- LOW HISTAMINE - Guard Rails
-- ============================================================================

-- Strictly Forbidden: Fermented foods, Aged cheese, Canned fish, Spinach, Tomatoes, Shellfish
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_categories',
  '["fermented_foods", "aged_cheese", "canned_fish", "shellfish"]'::jsonb,
  'STRICTLY FORBIDDEN: Fermented foods, Aged cheese, Canned fish, Shellfish',
  100
FROM public.diet_types dt
WHERE dt.name = 'Low Histamine'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Strictly Forbidden: Specific high-histamine ingredients
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_ingredients',
  '["spinach", "tomato", "sauerkraut", "kimchi", "kombucha", "aged_cheese", "parmesan", "blue_cheese", "canned_tuna", "canned_salmon", "shrimp", "lobster", "crab"]'::jsonb,
  'STRICTLY FORBIDDEN: High-histamine ingredients (Spinach, Tomatoes, Fermented foods, Aged cheese, Canned fish, Shellfish)',
  100
FROM public.diet_types dt
WHERE dt.name = 'Low Histamine'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Freshness Factor: Leftovers > 24h are forbidden. Meat must be fresh or flash-frozen
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'meal_structure',
  'freshness_requirement',
  '{"maxLeftoverHours": 24, "meatRequirement": "fresh_or_flash_frozen", "forbiddenStates": ["leftover_over_24h", "aged", "cured"]}'::jsonb,
  'GUARD RAIL FRESHNESS FACTOR: Leftovers > 24h are forbidden. Meat must be fresh or flash-frozen',
  100
FROM public.diet_types dt
WHERE dt.name = 'Low Histamine'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- ============================================================================
-- Helper Function: Get therapeutic diet rules with guard rails
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_therapeutic_diet_rules(p_diet_type_id UUID)
RETURNS TABLE (
  rule_type TEXT,
  rule_key TEXT,
  rule_value JSONB,
  description TEXT,
  priority INTEGER,
  is_guard_rail BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dr.rule_type,
    dr.rule_key,
    dr.rule_value,
    dr.description,
    dr.priority,
    CASE 
      WHEN dr.priority >= 90 THEN true
      ELSE false
    END as is_guard_rail
  FROM public.diet_rules dr
  WHERE dr.diet_type_id = p_diet_type_id
    AND dr.is_active = true
  ORDER BY dr.priority DESC, dr.rule_type ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Helper Function: Check if diet is therapeutic
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_therapeutic_diet(p_diet_type_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.diet_types dt
    WHERE dt.id = p_diet_type_id
      AND dt.name IN (
        'Wahls Paleo',
        'Overcoming MS (OMS)',
        'Autoimmune Protocol (AIP)',
        'Specific Carbohydrate Diet (SCD)',
        'Low Histamine'
      )
      AND dt.is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
