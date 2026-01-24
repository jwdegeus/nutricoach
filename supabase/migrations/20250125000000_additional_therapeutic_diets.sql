-- Migration: Additional Therapeutic Diets with Uniform Preference Schema
-- Created: 2025-01-25
-- Description: Adds remaining therapeutic diet protocols based on user requirements with uniform preference schema

-- ============================================================================
-- Add additional therapeutic diet types
-- ============================================================================

INSERT INTO public.diet_types (name, description, display_order) VALUES
  ('Best Bet Diet', 'Protocol for MS based on leaky gut theory. Strictly forbids dairy, gluten-containing grains, legumes, refined sugar, yeast. Requires allergy testing to identify individual triggers. Extensive vitamin/mineral supplementation essential.', 15),
  ('Anti-Inflammatory Diet (Weil)', 'Modified Mediterranean diet focused on lowering inflammation markers (CRP). Balance: 40% carbs (low glycemic), 30% fats (omega-3, olive oil), 30% protein. Emphasis on tea (white/green) and spices (turmeric, ginger).', 16),
  ('GAPS (Gut and Psychology Syndrome)', 'Based on SCD with heavy focus on detoxification and gut wall repair. Central: homemade meat/bone broths. Phased approach: starts with 6-phase Intro diet, slowly adding foods. Focus: probiotics (fermented juices) and avoiding all processed foods.', 17),
  ('IBD-AID (Anti-Inflammatory Diet for IBD)', 'Modern hybrid of SCD and anti-inflammatory diet. Texture adjustment: foods eaten in different textures (pureed vs whole) depending on flare status. Daily intake: fermented foods and soluble fibers (oatmeal allowed, unlike SCD).', 18),
  ('Therapeutic Ketogenic Diet', 'Originally for epilepsy, now used for neurodegenerative conditions. Fat: 70-80% of daily calories. Carbohydrates: strictly under 20-50g per day to achieve ketosis state.', 19)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- BEST BET DIET - Guard Rails
-- ============================================================================

-- Strictly Forbidden: Dairy, Gluten-containing grains, Legumes, Refined sugar, Yeast
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_categories',
  '["dairy", "gluten_containing_grains", "legumes", "refined_sugar", "yeast"]'::jsonb,
  'STRICTLY FORBIDDEN: Dairy, Gluten-containing grains, Legumes, Refined sugar, Yeast',
  100
FROM public.diet_types dt
WHERE dt.name = 'Best Bet Diet'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Specific gluten-containing grains
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_ingredients',
  '["wheat", "barley", "rye", "spelt", "kamut", "triticale"]'::jsonb,
  'STRICTLY FORBIDDEN: Gluten-containing grains (Wheat, Barley, Rye, Spelt, Kamut, Triticale)',
  100
FROM public.diet_types dt
WHERE dt.name = 'Best Bet Diet'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Recommendation: Allergy testing to identify individual triggers
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'allergy_testing_recommended',
  '{"recommendedIngredients": [], "focus": "allergy_testing_required", "description": "Embry recommends allergy testing to identify individual triggers"}'::jsonb,
  'RECOMMENDATION: Allergy testing recommended to identify individual triggers',
  50
FROM public.diet_types dt
WHERE dt.name = 'Best Bet Diet'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- ============================================================================
-- ANTI-INFLAMMATORY DIET (WEIL) - Guard Rails
-- ============================================================================

-- Macro Balance: 40% carbs (low glycemic), 30% fats, 30% protein
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'macro_constraint',
  'macro_balance',
  '{"dailyCarbLimit": null, "minFatPercentage": 30, "allowedTypes": ["low_glycemic_carbs"]}'::jsonb,
  'MACRO BALANCE: 40% carbs (low glycemic), 30% fats (omega-3, olive oil), 30% protein',
  80
FROM public.diet_types dt
WHERE dt.name = 'Anti-Inflammatory Diet (Weil)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Recommended: Tea (white/green) and spices (turmeric, ginger)
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'anti_inflammatory_foods',
  '{"recommendedIngredients": ["white_tea", "green_tea", "turmeric", "ginger", "olive_oil", "omega3_fish"], "focus": "anti_inflammatory"}'::jsonb,
  'RECOMMENDED: Tea (white/green) and spices (turmeric, ginger) for anti-inflammatory effect',
  60
FROM public.diet_types dt
WHERE dt.name = 'Anti-Inflammatory Diet (Weil)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- ============================================================================
-- GAPS (GUT AND PSYCHOLOGY SYNDROME) - Guard Rails
-- ============================================================================

-- Strictly Required: Homemade meat/bone broths (central to protocol)
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'daily_bone_broth',
  '{"requiredIngredients": ["bone_broth", "meat_broth"], "frequency": "daily", "focus": "gut_healing"}'::jsonb,
  'STRICTLY REQUIRED: Homemade meat/bone broths daily (central to GAPS protocol)',
  100
FROM public.diet_types dt
WHERE dt.name = 'GAPS (Gut and Psychology Syndrome)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Strictly Forbidden: All processed foods
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'exclude_ingredient',
  'excluded_categories',
  '["processed_foods", "refined_sugar", "artificial_additives"]'::jsonb,
  'STRICTLY FORBIDDEN: All processed foods, refined sugar, artificial additives',
  100
FROM public.diet_types dt
WHERE dt.name = 'GAPS (Gut and Psychology Syndrome)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Required: Probiotics (fermented juices)
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'probiotics_fermented',
  '{"requiredIngredients": ["fermented_juices", "probiotic_foods"], "frequency": "daily", "focus": "gut_microbiome"}'::jsonb,
  'REQUIRED: Probiotics (fermented juices) daily for gut microbiome support',
  90
FROM public.diet_types dt
WHERE dt.name = 'GAPS (Gut and Psychology Syndrome)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Meal Structure: Phased approach (6-phase Intro diet)
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'meal_structure',
  'phased_intro_diet',
  '{"minMealsPerDay": 3, "requiredMealTypes": ["breakfast", "lunch", "dinner"], "description": "Starts with 6-phase Intro diet, slowly adding foods"}'::jsonb,
  'MEAL STRUCTURE: Phased approach - starts with 6-phase Intro diet, slowly adding foods',
  70
FROM public.diet_types dt
WHERE dt.name = 'GAPS (Gut and Psychology Syndrome)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- ============================================================================
-- IBD-AID (ANTI-INFLAMMATORY DIET FOR IBD) - Guard Rails
-- ============================================================================

-- Meal Structure: Texture adjustment (pureed vs whole depending on flare)
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'meal_structure',
  'texture_adjustment',
  '{"description": "Foods eaten in different textures (pureed vs whole) depending on flare status"}'::jsonb,
  'MEAL STRUCTURE: Texture adjustment - foods in different textures (pureed vs whole) depending on flare status',
  80
FROM public.diet_types dt
WHERE dt.name = 'IBD-AID (Anti-Inflammatory Diet for IBD)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Required: Daily fermented foods and soluble fibers
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'daily_prebiotics_probiotics',
  '{"requiredIngredients": ["fermented_foods", "soluble_fiber"], "frequency": "daily", "recommendedIngredients": ["oatmeal", "fermented_vegetables"]}'::jsonb,
  'REQUIRED: Daily fermented foods and soluble fibers (oatmeal allowed, unlike SCD)',
  90
FROM public.diet_types dt
WHERE dt.name = 'IBD-AID (Anti-Inflammatory Diet for IBD)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Permitted: Oatmeal (unlike SCD)
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'require_ingredient',
  'permitted_oatmeal',
  '{"recommendedIngredients": ["oatmeal"], "description": "Oatmeal permitted (unlike SCD)"}'::jsonb,
  'PERMITTED: Oatmeal (unlike SCD)',
  50
FROM public.diet_types dt
WHERE dt.name = 'IBD-AID (Anti-Inflammatory Diet for IBD)'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- ============================================================================
-- THERAPEUTIC KETOGENIC DIET - Guard Rails
-- ============================================================================

-- Macro Constraint: Fat 70-80% of daily calories
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'macro_constraint',
  'ketogenic_fat_ratio',
  '{"minFatPercentage": 70, "description": "Fat must be 70-80% of daily calories"}'::jsonb,
  'GUARD RAIL: Fat must be 70-80% of daily calories',
  100
FROM public.diet_types dt
WHERE dt.name = 'Therapeutic Ketogenic Diet'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- Macro Constraint: Carbohydrates strictly under 20-50g per day
INSERT INTO public.diet_rules (diet_type_id, rule_type, rule_key, rule_value, description, priority)
SELECT 
  dt.id,
  'macro_constraint',
  'ketogenic_carb_limit',
  '{"dailyCarbLimit": 50, "description": "Carbohydrates strictly under 20-50g per day to achieve ketosis"}'::jsonb,
  'GUARD RAIL: Carbohydrates strictly under 20-50g per day to achieve ketosis state',
  100
FROM public.diet_types dt
WHERE dt.name = 'Therapeutic Ketogenic Diet'
ON CONFLICT (diet_type_id, rule_type, rule_key) DO UPDATE
SET rule_value = EXCLUDED.rule_value, description = EXCLUDED.description, priority = EXCLUDED.priority;

-- ============================================================================
-- Update helper function to include new therapeutic diets
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
        'Low Histamine',
        'Best Bet Diet',
        'Anti-Inflammatory Diet (Weil)',
        'GAPS (Gut and Psychology Syndrome)',
        'IBD-AID (Anti-Inflammatory Diet for IBD)',
        'Therapeutic Ketogenic Diet'
      )
      AND dt.is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
