/**
 * Nutrition Calculator
 *
 * Helper functions for calculating nutritional values per meal using NEVO data
 */

import { createClient as createServerClient } from '@/src/lib/supabase/server';

/**
 * Complete nutritional profile for a meal or ingredient
 */
export interface NutritionalProfile {
  // Energie
  energy_kj: number | null;
  energy_kcal: number | null;

  // Macronutriënten
  water_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  monounsaturated_fat_g: number | null;
  polyunsaturated_fat_g: number | null;
  omega3_fat_g: number | null;
  omega6_fat_g: number | null;
  trans_fat_g: number | null;
  carbs_g: number | null;
  sugar_g: number | null;
  free_sugars_g: number | null;
  starch_g: number | null;
  fiber_g: number | null;
  alcohol_g: number | null;

  // Mineralen en spoorelementen
  cholesterol_mg: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  calcium_mg: number | null;
  phosphorus_mg: number | null;
  magnesium_mg: number | null;
  iron_mg: number | null;
  copper_mg: number | null;
  selenium_ug: number | null;
  zinc_mg: number | null;
  iodine_ug: number | null;

  // Vitamines
  vit_a_rae_ug: number | null;
  vit_d_ug: number | null;
  vit_e_mg: number | null;
  vit_k_ug: number | null;
  vit_b1_mg: number | null;
  vit_b2_mg: number | null;
  vit_b6_mg: number | null;
  vit_b12_ug: number | null;
  niacin_equiv_mg: number | null;
  folate_equiv_ug: number | null;
  vit_c_mg: number | null;
}

/**
 * Meal ingredient with amount
 */
export interface MealIngredient {
  nevo_food_id: number;
  amount_g: number; // Amount in grams
}

/**
 * Recipe ingredient: NEVO, custom and/or FNDDS with amount (for aggregated nutrition)
 */
export interface RecipeIngredient {
  nevo_food_id?: number;
  custom_food_id?: string;
  /** FNDDS survey food fdc_id when source is FNDDS */
  fndds_fdc_id?: number;
  amount_g: number;
}

/**
 * Calculate nutritional values for a single ingredient
 *
 * @param nevoFoodId - NEVO food ID
 * @param amountG - Amount in grams
 * @returns Nutritional profile for the specified amount
 */
export async function calculateIngredientNutrition(
  nevoFoodId: number,
  amountG: number,
): Promise<NutritionalProfile | null> {
  const supabase = await createServerClient();

  const { data: food, error } = await supabase
    .from('nevo_foods')
    .select('*')
    .eq('nevo_code', nevoFoodId)
    .single();

  if (error || !food) {
    console.error('Error fetching NEVO food:', error);
    return null;
  }

  // Calculate values based on amount (NEVO data is per 100g)
  const multiplier = amountG / 100;

  return {
    energy_kj: food.energy_kj ? food.energy_kj * multiplier : null,
    energy_kcal: food.energy_kcal ? food.energy_kcal * multiplier : null,
    water_g: food.water_g ? food.water_g * multiplier : null,
    protein_g: food.protein_g ? food.protein_g * multiplier : null,
    fat_g: food.fat_g ? food.fat_g * multiplier : null,
    saturated_fat_g: food.saturated_fat_g
      ? food.saturated_fat_g * multiplier
      : null,
    monounsaturated_fat_g: food.monounsaturated_fat_g
      ? food.monounsaturated_fat_g * multiplier
      : null,
    polyunsaturated_fat_g: food.polyunsaturated_fat_g
      ? food.polyunsaturated_fat_g * multiplier
      : null,
    omega3_fat_g: food.omega3_fat_g ? food.omega3_fat_g * multiplier : null,
    omega6_fat_g: food.omega6_fat_g ? food.omega6_fat_g * multiplier : null,
    trans_fat_g: food.trans_fat_g ? food.trans_fat_g * multiplier : null,
    carbs_g: food.carbs_g ? food.carbs_g * multiplier : null,
    sugar_g: food.sugar_g ? food.sugar_g * multiplier : null,
    free_sugars_g: food.free_sugars_g ? food.free_sugars_g * multiplier : null,
    starch_g: food.starch_g ? food.starch_g * multiplier : null,
    fiber_g: food.fiber_g ? food.fiber_g * multiplier : null,
    alcohol_g: food.alcohol_g ? food.alcohol_g * multiplier : null,
    cholesterol_mg: food.cholesterol_mg
      ? food.cholesterol_mg * multiplier
      : null,
    sodium_mg: food.sodium_mg ? food.sodium_mg * multiplier : null,
    potassium_mg: food.potassium_mg ? food.potassium_mg * multiplier : null,
    calcium_mg: food.calcium_mg ? food.calcium_mg * multiplier : null,
    phosphorus_mg: food.phosphorus_mg ? food.phosphorus_mg * multiplier : null,
    magnesium_mg: food.magnesium_mg ? food.magnesium_mg * multiplier : null,
    iron_mg: food.iron_mg ? food.iron_mg * multiplier : null,
    copper_mg: food.copper_mg ? food.copper_mg * multiplier : null,
    selenium_ug: food.selenium_ug ? food.selenium_ug * multiplier : null,
    zinc_mg: food.zinc_mg ? food.zinc_mg * multiplier : null,
    iodine_ug: food.iodine_ug ? food.iodine_ug * multiplier : null,
    vit_a_rae_ug: food.vit_a_rae_ug ? food.vit_a_rae_ug * multiplier : null,
    vit_d_ug: food.vit_d_ug ? food.vit_d_ug * multiplier : null,
    vit_e_mg: food.vit_e_mg ? food.vit_e_mg * multiplier : null,
    vit_k_ug: food.vit_k_ug ? food.vit_k_ug * multiplier : null,
    vit_b1_mg: food.vit_b1_mg ? food.vit_b1_mg * multiplier : null,
    vit_b2_mg: food.vit_b2_mg ? food.vit_b2_mg * multiplier : null,
    vit_b6_mg: food.vit_b6_mg ? food.vit_b6_mg * multiplier : null,
    vit_b12_ug: food.vit_b12_ug ? food.vit_b12_ug * multiplier : null,
    niacin_equiv_mg: food.niacin_equiv_mg
      ? food.niacin_equiv_mg * multiplier
      : null,
    folate_equiv_ug: food.folate_equiv_ug
      ? food.folate_equiv_ug * multiplier
      : null,
    vit_c_mg: food.vit_c_mg ? food.vit_c_mg * multiplier : null,
  };
}

/**
 * Calculate nutritional values for multiple ingredients (a meal)
 *
 * @param ingredients - Array of meal ingredients with amounts
 * @returns Combined nutritional profile for all ingredients
 */
export async function calculateMealNutrition(
  ingredients: MealIngredient[],
): Promise<NutritionalProfile> {
  const profiles = await Promise.all(
    ingredients.map((ing) =>
      calculateIngredientNutrition(ing.nevo_food_id, ing.amount_g),
    ),
  );

  // Aggregate all profiles
  const aggregated: NutritionalProfile = {
    energy_kj: 0,
    energy_kcal: 0,
    water_g: 0,
    protein_g: 0,
    fat_g: 0,
    saturated_fat_g: 0,
    monounsaturated_fat_g: 0,
    polyunsaturated_fat_g: 0,
    omega3_fat_g: 0,
    omega6_fat_g: 0,
    trans_fat_g: 0,
    carbs_g: 0,
    sugar_g: 0,
    free_sugars_g: 0,
    starch_g: 0,
    fiber_g: 0,
    alcohol_g: 0,
    cholesterol_mg: 0,
    sodium_mg: 0,
    potassium_mg: 0,
    calcium_mg: 0,
    phosphorus_mg: 0,
    magnesium_mg: 0,
    iron_mg: 0,
    copper_mg: 0,
    selenium_ug: 0,
    zinc_mg: 0,
    iodine_ug: 0,
    vit_a_rae_ug: 0,
    vit_d_ug: 0,
    vit_e_mg: 0,
    vit_k_ug: 0,
    vit_b1_mg: 0,
    vit_b2_mg: 0,
    vit_b6_mg: 0,
    vit_b12_ug: 0,
    niacin_equiv_mg: 0,
    folate_equiv_ug: 0,
    vit_c_mg: 0,
  };

  // Sum all values
  profiles.forEach((profile) => {
    if (!profile) return;

    Object.keys(aggregated).forEach((key) => {
      const value = profile[key as keyof NutritionalProfile];
      if (value !== null && value !== undefined) {
        (aggregated[key as keyof NutritionalProfile] as number) += value;
      }
    });
  });

  // Convert zeros to null for consistency
  Object.keys(aggregated).forEach((key) => {
    const value = aggregated[key as keyof NutritionalProfile];
    if (value === 0) {
      (aggregated[key as keyof NutritionalProfile] as number | null) = null;
    }
  });

  return aggregated;
}

/**
 * Calculate nutritional values for a recipe (NEVO + custom ingredients)
 *
 * @param ingredients - Array of recipe ingredients with nevo_food_id or custom_food_id and amount_g
 * @returns Combined nutritional profile and total weight in grams
 */
export async function calculateRecipeNutrition(
  ingredients: RecipeIngredient[],
): Promise<{ profile: NutritionalProfile; totalG: number }> {
  const totalG = ingredients.reduce((sum, ing) => sum + (ing.amount_g || 0), 0);
  if (totalG <= 0 || ingredients.length === 0) {
    const empty: NutritionalProfile = {
      energy_kj: null,
      energy_kcal: null,
      water_g: null,
      protein_g: null,
      fat_g: null,
      saturated_fat_g: null,
      monounsaturated_fat_g: null,
      polyunsaturated_fat_g: null,
      omega3_fat_g: null,
      omega6_fat_g: null,
      trans_fat_g: null,
      carbs_g: null,
      sugar_g: null,
      free_sugars_g: null,
      starch_g: null,
      fiber_g: null,
      alcohol_g: null,
      cholesterol_mg: null,
      sodium_mg: null,
      potassium_mg: null,
      calcium_mg: null,
      phosphorus_mg: null,
      magnesium_mg: null,
      iron_mg: null,
      copper_mg: null,
      selenium_ug: null,
      zinc_mg: null,
      iodine_ug: null,
      vit_a_rae_ug: null,
      vit_d_ug: null,
      vit_e_mg: null,
      vit_k_ug: null,
      vit_b1_mg: null,
      vit_b2_mg: null,
      vit_b6_mg: null,
      vit_b12_ug: null,
      niacin_equiv_mg: null,
      folate_equiv_ug: null,
      vit_c_mg: null,
    };
    return { profile: empty, totalG: 0 };
  }

  const profiles = await Promise.all(
    ingredients.map(async (ing) => {
      const amountG = ing.amount_g || 0;
      if (amountG <= 0) return null;
      if (ing.nevo_food_id != null) {
        return calculateIngredientNutrition(ing.nevo_food_id, amountG);
      }
      if (ing.custom_food_id) {
        return calculateCustomFoodNutrition(ing.custom_food_id, amountG);
      }
      if (ing.fndds_fdc_id != null) {
        return calculateFnddsNutrition(ing.fndds_fdc_id, amountG);
      }
      return null;
    }),
  );

  const aggregated: NutritionalProfile = {
    energy_kj: 0,
    energy_kcal: 0,
    water_g: 0,
    protein_g: 0,
    fat_g: 0,
    saturated_fat_g: 0,
    monounsaturated_fat_g: 0,
    polyunsaturated_fat_g: 0,
    omega3_fat_g: 0,
    omega6_fat_g: 0,
    trans_fat_g: 0,
    carbs_g: 0,
    sugar_g: 0,
    free_sugars_g: 0,
    starch_g: 0,
    fiber_g: 0,
    alcohol_g: 0,
    cholesterol_mg: 0,
    sodium_mg: 0,
    potassium_mg: 0,
    calcium_mg: 0,
    phosphorus_mg: 0,
    magnesium_mg: 0,
    iron_mg: 0,
    copper_mg: 0,
    selenium_ug: 0,
    zinc_mg: 0,
    iodine_ug: 0,
    vit_a_rae_ug: 0,
    vit_d_ug: 0,
    vit_e_mg: 0,
    vit_k_ug: 0,
    vit_b1_mg: 0,
    vit_b2_mg: 0,
    vit_b6_mg: 0,
    vit_b12_ug: 0,
    niacin_equiv_mg: 0,
    folate_equiv_ug: 0,
    vit_c_mg: 0,
  };

  profiles.forEach((profile) => {
    if (!profile) return;
    Object.keys(aggregated).forEach((key) => {
      const value = profile[key as keyof NutritionalProfile];
      if (value !== null && value !== undefined) {
        (aggregated[key as keyof NutritionalProfile] as number) += value;
      }
    });
  });

  Object.keys(aggregated).forEach((key) => {
    const value = aggregated[key as keyof NutritionalProfile];
    if (value === 0) {
      (aggregated[key as keyof NutritionalProfile] as number | null) = null;
    }
  });

  return { profile: aggregated, totalG };
}

/**
 * Scale a nutritional profile by a factor (e.g. total → per 100g)
 */
export function scaleProfile(
  profile: NutritionalProfile,
  factor: number,
): NutritionalProfile {
  const out: NutritionalProfile = { ...profile };
  (Object.keys(out) as (keyof NutritionalProfile)[]).forEach((key) => {
    const v = out[key];
    if (v != null && typeof v === 'number') {
      (out[key] as number) = v * factor;
    }
  });
  return out;
}

/**
 * Calculate NutriScore from a nutritional profile (per 100g).
 * Use for composite foods (e.g. full recipe); fruit/veg component is not used.
 *
 * @param profile - Nutritional profile per 100g
 * @returns NutriScore grade (A-E) or null
 */
export function calculateNutriScoreFromProfile(
  profile: NutritionalProfile,
): NutriScoreGrade | null {
  if (!profile) return null;

  const energyKcal = profile.energy_kcal ?? 0;
  const sugarsG = profile.sugar_g ?? 0;
  const saturatedFatG = profile.saturated_fat_g ?? 0;
  const sodiumMg = profile.sodium_mg ?? 0;
  const fiberG = profile.fiber_g ?? 0;
  const proteinG = profile.protein_g ?? 0;
  const saltG = (sodiumMg / 1000) * 2.5;

  let negativePoints = 0;

  if (energyKcal <= 335) negativePoints += 0;
  else if (energyKcal <= 670) negativePoints += 1;
  else if (energyKcal <= 1005) negativePoints += 2;
  else if (energyKcal <= 1340) negativePoints += 3;
  else if (energyKcal <= 1675) negativePoints += 4;
  else if (energyKcal <= 2010) negativePoints += 5;
  else if (energyKcal <= 2345) negativePoints += 6;
  else if (energyKcal <= 2680) negativePoints += 7;
  else if (energyKcal <= 3015) negativePoints += 8;
  else if (energyKcal <= 3350) negativePoints += 9;
  else negativePoints += 10;

  if (sugarsG <= 4.5) negativePoints += 0;
  else if (sugarsG <= 9) negativePoints += 1;
  else if (sugarsG <= 13.5) negativePoints += 2;
  else if (sugarsG <= 18) negativePoints += 3;
  else if (sugarsG <= 22.5) negativePoints += 4;
  else if (sugarsG <= 27) negativePoints += 5;
  else if (sugarsG <= 31) negativePoints += 6;
  else if (sugarsG <= 36) negativePoints += 7;
  else if (sugarsG <= 40) negativePoints += 8;
  else if (sugarsG <= 45) negativePoints += 9;
  else negativePoints += 10;

  if (saturatedFatG <= 1) negativePoints += 0;
  else if (saturatedFatG <= 2) negativePoints += 1;
  else if (saturatedFatG <= 3) negativePoints += 2;
  else if (saturatedFatG <= 4) negativePoints += 3;
  else if (saturatedFatG <= 5) negativePoints += 4;
  else if (saturatedFatG <= 6) negativePoints += 5;
  else if (saturatedFatG <= 7) negativePoints += 6;
  else if (saturatedFatG <= 8) negativePoints += 7;
  else if (saturatedFatG <= 9) negativePoints += 8;
  else if (saturatedFatG <= 10) negativePoints += 9;
  else negativePoints += 10;

  if (saltG <= 0.3) negativePoints += 0;
  else if (saltG <= 0.6) negativePoints += 1;
  else if (saltG <= 0.9) negativePoints += 2;
  else if (saltG <= 1.2) negativePoints += 3;
  else if (saltG <= 1.5) negativePoints += 4;
  else if (saltG <= 1.8) negativePoints += 5;
  else if (saltG <= 2.1) negativePoints += 6;
  else if (saltG <= 2.4) negativePoints += 7;
  else if (saltG <= 2.7) negativePoints += 8;
  else if (saltG <= 3.0) negativePoints += 9;
  else negativePoints += 10;

  let positivePoints = 0;
  if (fiberG >= 4.7) positivePoints += 5;
  else if (fiberG >= 3.7) positivePoints += 4;
  else if (fiberG >= 2.8) positivePoints += 3;
  else if (fiberG >= 1.9) positivePoints += 2;
  else if (fiberG >= 0.9) positivePoints += 1;

  if (negativePoints < 11) {
    if (proteinG >= 8.0) positivePoints += 7;
    else if (proteinG >= 6.4) positivePoints += 6;
    else if (proteinG >= 4.8) positivePoints += 5;
    else if (proteinG >= 3.2) positivePoints += 4;
    else if (proteinG >= 2.4) positivePoints += 3;
    else if (proteinG >= 1.6) positivePoints += 2;
    else if (proteinG >= 0.8) positivePoints += 1;
  }

  const finalScore = negativePoints - positivePoints;
  if (finalScore <= -1) return 'A';
  if (finalScore <= 2) return 'B';
  if (finalScore <= 10) return 'C';
  if (finalScore <= 18) return 'D';
  return 'E';
}

const NEVO_SEARCH_COLS =
  'nevo_code, name_nl, name_en, food_group_nl, energy_kcal, protein_g, fat_g, carbs_g, fiber_g';

/**
 * Search for NEVO foods by name
 *
 * @param searchTerm - Search term (Dutch or English)
 * @param limit - Maximum number of results
 * @returns Array of matching NEVO foods
 */
export async function searchNevoFoods(
  searchTerm: string,
  limit: number = 20,
): Promise<Record<string, unknown>[]> {
  const supabase = await createServerClient();
  const trimmed = searchTerm.trim();
  if (!trimmed) return [];

  // Twee aparte ilike-queries i.p.v. .or() om PostgREST/URL-encoding problemen te vermijden
  const pattern = `%${trimmed.replace(/'/g, "''")}%`;

  const [byNl, byEn] = await Promise.all([
    supabase
      .from('nevo_foods')
      .select(NEVO_SEARCH_COLS)
      .ilike('name_nl', pattern)
      .limit(limit),
    supabase
      .from('nevo_foods')
      .select(NEVO_SEARCH_COLS)
      .ilike('name_en', pattern)
      .limit(limit),
  ]);

  if (byNl.error) {
    console.error('Error searching NEVO foods (name_nl):', byNl.error);
    return [];
  }
  if (byEn.error) {
    console.error('Error searching NEVO foods (name_en):', byEn.error);
    return byNl.data ?? [];
  }

  const seen = new Set<number>();
  const merged: Record<string, unknown>[] = [];
  for (const row of [...(byNl.data ?? []), ...(byEn.data ?? [])]) {
    const r = row as Record<string, unknown> & { nevo_code: number };
    if (seen.has(r.nevo_code)) continue;
    seen.add(r.nevo_code);
    merged.push(r);
    if (merged.length >= limit) break;
  }
  return merged;
}

/**
 * Get NEVO food by code
 *
 * @param nevoCode - NEVO food code
 * @returns NEVO food data or null
 */
export async function getNevoFoodByCode(
  nevoCode: number,
): Promise<Record<string, unknown> | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('nevo_foods')
    .select('*')
    .eq('nevo_code', nevoCode)
    .single();

  if (error) {
    console.error('Error fetching NEVO food:', error);
    return null;
  }

  return data;
}

/**
 * Get custom food by id
 *
 * @param customFoodId - UUID of custom_foods row
 * @returns Custom food data or null
 */
export async function getCustomFoodById(
  customFoodId: string,
): Promise<Record<string, unknown> | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('custom_foods')
    .select('*')
    .eq('id', customFoodId)
    .single();

  if (error) {
    console.error('Error fetching custom food:', error);
    return null;
  }

  return data;
}

/**
 * Calculate nutritional values for a custom food (per amount)
 * custom_foods has same nutrient columns as nevo_foods (per 100g).
 *
 * @param customFoodId - UUID of custom_foods row
 * @param amountG - Amount in grams
 * @returns Nutritional profile for the specified amount
 */
export async function calculateCustomFoodNutrition(
  customFoodId: string,
  amountG: number,
): Promise<NutritionalProfile | null> {
  const supabase = await createServerClient();

  const { data: food, error } = await supabase
    .from('custom_foods')
    .select('*')
    .eq('id', customFoodId)
    .single();

  if (error || !food) {
    console.error('Error fetching custom food:', error);
    return null;
  }

  const multiplier = amountG / 100;

  return {
    energy_kj: food.energy_kj ? food.energy_kj * multiplier : null,
    energy_kcal: food.energy_kcal ? food.energy_kcal * multiplier : null,
    water_g: food.water_g ? food.water_g * multiplier : null,
    protein_g: food.protein_g ? food.protein_g * multiplier : null,
    fat_g: food.fat_g ? food.fat_g * multiplier : null,
    saturated_fat_g: food.saturated_fat_g
      ? food.saturated_fat_g * multiplier
      : null,
    monounsaturated_fat_g: food.monounsaturated_fat_g
      ? food.monounsaturated_fat_g * multiplier
      : null,
    polyunsaturated_fat_g: food.polyunsaturated_fat_g
      ? food.polyunsaturated_fat_g * multiplier
      : null,
    omega3_fat_g: food.omega3_fat_g ? food.omega3_fat_g * multiplier : null,
    omega6_fat_g: food.omega6_fat_g ? food.omega6_fat_g * multiplier : null,
    trans_fat_g: food.trans_fat_g ? food.trans_fat_g * multiplier : null,
    carbs_g: food.carbs_g ? food.carbs_g * multiplier : null,
    sugar_g: food.sugar_g ? food.sugar_g * multiplier : null,
    free_sugars_g: food.free_sugars_g ? food.free_sugars_g * multiplier : null,
    starch_g: food.starch_g ? food.starch_g * multiplier : null,
    fiber_g: food.fiber_g ? food.fiber_g * multiplier : null,
    alcohol_g: food.alcohol_g ? food.alcohol_g * multiplier : null,
    cholesterol_mg: food.cholesterol_mg
      ? food.cholesterol_mg * multiplier
      : null,
    sodium_mg: food.sodium_mg ? food.sodium_mg * multiplier : null,
    potassium_mg: food.potassium_mg ? food.potassium_mg * multiplier : null,
    calcium_mg: food.calcium_mg ? food.calcium_mg * multiplier : null,
    phosphorus_mg: food.phosphorus_mg ? food.phosphorus_mg * multiplier : null,
    magnesium_mg: food.magnesium_mg ? food.magnesium_mg * multiplier : null,
    iron_mg: food.iron_mg ? food.iron_mg * multiplier : null,
    copper_mg: food.copper_mg ? food.copper_mg * multiplier : null,
    selenium_ug: food.selenium_ug ? food.selenium_ug * multiplier : null,
    zinc_mg: food.zinc_mg ? food.zinc_mg * multiplier : null,
    iodine_ug: food.iodine_ug ? food.iodine_ug * multiplier : null,
    vit_a_rae_ug: food.vit_a_rae_ug ? food.vit_a_rae_ug * multiplier : null,
    vit_d_ug: food.vit_d_ug ? food.vit_d_ug * multiplier : null,
    vit_e_mg: food.vit_e_mg ? food.vit_e_mg * multiplier : null,
    vit_k_ug: food.vit_k_ug ? food.vit_k_ug * multiplier : null,
    vit_b1_mg: food.vit_b1_mg ? food.vit_b1_mg * multiplier : null,
    vit_b2_mg: food.vit_b2_mg ? food.vit_b2_mg * multiplier : null,
    vit_b6_mg: food.vit_b6_mg ? food.vit_b6_mg * multiplier : null,
    vit_b12_ug: food.vit_b12_ug ? food.vit_b12_ug * multiplier : null,
    niacin_equiv_mg: food.niacin_equiv_mg
      ? food.niacin_equiv_mg * multiplier
      : null,
    folate_equiv_ug: food.folate_equiv_ug
      ? food.folate_equiv_ug * multiplier
      : null,
    vit_c_mg: food.vit_c_mg ? food.vit_c_mg * multiplier : null,
  };
}

/** Keys that map to NutritionalProfile (used for FNDDS row → profile). */
const NUTRITIONAL_PROFILE_KEYS: (keyof NutritionalProfile)[] = [
  'energy_kj',
  'energy_kcal',
  'water_g',
  'protein_g',
  'fat_g',
  'saturated_fat_g',
  'monounsaturated_fat_g',
  'polyunsaturated_fat_g',
  'omega3_fat_g',
  'omega6_fat_g',
  'trans_fat_g',
  'carbs_g',
  'sugar_g',
  'free_sugars_g',
  'starch_g',
  'fiber_g',
  'alcohol_g',
  'cholesterol_mg',
  'sodium_mg',
  'potassium_mg',
  'calcium_mg',
  'phosphorus_mg',
  'magnesium_mg',
  'iron_mg',
  'copper_mg',
  'selenium_ug',
  'zinc_mg',
  'iodine_ug',
  'vit_a_rae_ug',
  'vit_d_ug',
  'vit_e_mg',
  'vit_k_ug',
  'vit_b1_mg',
  'vit_b2_mg',
  'vit_b6_mg',
  'vit_b12_ug',
  'niacin_equiv_mg',
  'folate_equiv_ug',
  'vit_c_mg',
];

/**
 * Calculate nutritional values for an FNDDS survey food (per 100g from fndds_survey_food_nutrients_mapped).
 *
 * @param fdcId - FNDDS survey food fdc_id
 * @param amountG - Amount in grams
 * @returns Nutritional profile for the specified amount
 */
export async function calculateFnddsNutrition(
  fdcId: number,
  amountG: number,
): Promise<NutritionalProfile | null> {
  const supabase = await createServerClient();

  const { data: rows, error } = await supabase
    .from('fndds_survey_food_nutrients_mapped')
    .select('internal_nutrient_key, amount_per_100g')
    .eq('fdc_id', fdcId);

  if (error || !rows?.length) {
    return null;
  }

  const multiplier = amountG / 100;
  const profile: NutritionalProfile = {
    energy_kj: null,
    energy_kcal: null,
    water_g: null,
    protein_g: null,
    fat_g: null,
    saturated_fat_g: null,
    monounsaturated_fat_g: null,
    polyunsaturated_fat_g: null,
    omega3_fat_g: null,
    omega6_fat_g: null,
    trans_fat_g: null,
    carbs_g: null,
    sugar_g: null,
    free_sugars_g: null,
    starch_g: null,
    fiber_g: null,
    alcohol_g: null,
    cholesterol_mg: null,
    sodium_mg: null,
    potassium_mg: null,
    calcium_mg: null,
    phosphorus_mg: null,
    magnesium_mg: null,
    iron_mg: null,
    copper_mg: null,
    selenium_ug: null,
    zinc_mg: null,
    iodine_ug: null,
    vit_a_rae_ug: null,
    vit_d_ug: null,
    vit_e_mg: null,
    vit_k_ug: null,
    vit_b1_mg: null,
    vit_b2_mg: null,
    vit_b6_mg: null,
    vit_b12_ug: null,
    niacin_equiv_mg: null,
    folate_equiv_ug: null,
    vit_c_mg: null,
  };

  for (const row of rows as {
    internal_nutrient_key: string;
    amount_per_100g: number | null;
  }[]) {
    const key = row.internal_nutrient_key as keyof NutritionalProfile;
    if (NUTRITIONAL_PROFILE_KEYS.includes(key) && row.amount_per_100g != null) {
      (profile[key] as number) = Number(row.amount_per_100g) * multiplier;
    }
  }

  return profile;
}

/**
 * NutriScore grade (A-E)
 */
export type NutriScoreGrade = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * Calculate NutriScore for a food item based on NEVO data
 *
 * Based on FSA-NPS (Food Standards Agency Nutrient Profiling System)
 * Final Score = Negative Points - Positive Points
 *
 * @param food - NEVO food data (per 100g)
 * @returns NutriScore grade (A-E) or null if calculation not possible
 */
export function calculateNutriScore(
  food: Record<string, unknown>,
): NutriScoreGrade | null {
  if (!food) return null;

  // Get values per 100g (NEVO data is already per 100g)
  const energyKcal = Number(food.energy_kcal ?? 0);
  const sugarsG = Number(food.sugar_g ?? 0);
  const saturatedFatG = Number(food.saturated_fat_g ?? 0);
  const sodiumMg = Number(food.sodium_mg ?? 0);
  const fiberG = Number(food.fiber_g ?? 0);
  const proteinG = Number(food.protein_g ?? 0);

  // Convert sodium from mg to g for calculation
  const saltG = (sodiumMg / 1000) * 2.5; // Sodium to salt conversion

  // Calculate negative points (0-40)
  let negativePoints = 0;

  // Energy points (0-10)
  if (energyKcal <= 335) negativePoints += 0;
  else if (energyKcal <= 670) negativePoints += 1;
  else if (energyKcal <= 1005) negativePoints += 2;
  else if (energyKcal <= 1340) negativePoints += 3;
  else if (energyKcal <= 1675) negativePoints += 4;
  else if (energyKcal <= 2010) negativePoints += 5;
  else if (energyKcal <= 2345) negativePoints += 6;
  else if (energyKcal <= 2680) negativePoints += 7;
  else if (energyKcal <= 3015) negativePoints += 8;
  else if (energyKcal <= 3350) negativePoints += 9;
  else negativePoints += 10;

  // Sugars points (0-10)
  if (sugarsG <= 4.5) negativePoints += 0;
  else if (sugarsG <= 9) negativePoints += 1;
  else if (sugarsG <= 13.5) negativePoints += 2;
  else if (sugarsG <= 18) negativePoints += 3;
  else if (sugarsG <= 22.5) negativePoints += 4;
  else if (sugarsG <= 27) negativePoints += 5;
  else if (sugarsG <= 31) negativePoints += 6;
  else if (sugarsG <= 36) negativePoints += 7;
  else if (sugarsG <= 40) negativePoints += 8;
  else if (sugarsG <= 45) negativePoints += 9;
  else negativePoints += 10;

  // Saturated fat points (0-10)
  if (saturatedFatG <= 1) negativePoints += 0;
  else if (saturatedFatG <= 2) negativePoints += 1;
  else if (saturatedFatG <= 3) negativePoints += 2;
  else if (saturatedFatG <= 4) negativePoints += 3;
  else if (saturatedFatG <= 5) negativePoints += 4;
  else if (saturatedFatG <= 6) negativePoints += 5;
  else if (saturatedFatG <= 7) negativePoints += 6;
  else if (saturatedFatG <= 8) negativePoints += 7;
  else if (saturatedFatG <= 9) negativePoints += 8;
  else if (saturatedFatG <= 10) negativePoints += 9;
  else negativePoints += 10;

  // Salt points (0-10)
  if (saltG <= 0.3) negativePoints += 0;
  else if (saltG <= 0.6) negativePoints += 1;
  else if (saltG <= 0.9) negativePoints += 2;
  else if (saltG <= 1.2) negativePoints += 3;
  else if (saltG <= 1.5) negativePoints += 4;
  else if (saltG <= 1.8) negativePoints += 5;
  else if (saltG <= 2.1) negativePoints += 6;
  else if (saltG <= 2.4) negativePoints += 7;
  else if (saltG <= 2.7) negativePoints += 8;
  else if (saltG <= 3.0) negativePoints += 9;
  else negativePoints += 10;

  // Calculate positive points (0-17)
  let positivePoints = 0;

  // Fruits/Vegetables/Nuts points (0-5)
  // Note: NEVO doesn't have a direct field for this, so we'll use food_group_nl as approximation
  const foodGroup = String(food.food_group_nl ?? '').toLowerCase();
  const isFruitVeg =
    foodGroup.includes('fruit') ||
    foodGroup.includes('groente') ||
    foodGroup.includes('groenten') ||
    foodGroup.includes('noten') ||
    foodGroup.includes('zaden');

  if (isFruitVeg) {
    // Approximate: if it's in fruit/veg category, assume high content
    positivePoints += 5;
  }

  // Fiber points (0-5)
  if (fiberG >= 4.7) positivePoints += 5;
  else if (fiberG >= 3.7) positivePoints += 4;
  else if (fiberG >= 2.8) positivePoints += 3;
  else if (fiberG >= 1.9) positivePoints += 2;
  else if (fiberG >= 0.9) positivePoints += 1;

  // Protein points (0-7, but only if negative points < 11 OR fruits/vegetables > 80%)
  // For simplicity, we'll apply protein points if negative points < 11
  if (negativePoints < 11) {
    if (proteinG >= 8.0) positivePoints += 7;
    else if (proteinG >= 6.4) positivePoints += 6;
    else if (proteinG >= 4.8) positivePoints += 5;
    else if (proteinG >= 3.2) positivePoints += 4;
    else if (proteinG >= 2.4) positivePoints += 3;
    else if (proteinG >= 1.6) positivePoints += 2;
    else if (proteinG >= 0.8) positivePoints += 1;
  }

  // Calculate final score
  const finalScore = negativePoints - positivePoints;

  // Convert to grade
  if (finalScore <= -1) return 'A';
  if (finalScore <= 2) return 'B';
  if (finalScore <= 10) return 'C';
  if (finalScore <= 18) return 'D';
  return 'E';
}
