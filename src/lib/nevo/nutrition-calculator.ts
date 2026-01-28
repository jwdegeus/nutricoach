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
 * Search for NEVO foods by name
 *
 * @param searchTerm - Search term (Dutch or English)
 * @param limit - Maximum number of results
 * @returns Array of matching NEVO foods
 */
export async function searchNevoFoods(
  searchTerm: string,
  limit: number = 20,
): Promise<any[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('nevo_foods')
    .select(
      'nevo_code, name_nl, name_en, food_group_nl, energy_kcal, protein_g, fat_g, carbs_g',
    )
    .or(
      `name_nl.ilike.%${searchTerm}%,name_en.ilike.%${searchTerm}%,synonym.ilike.%${searchTerm}%`,
    )
    .limit(limit);

  if (error) {
    console.error('Error searching NEVO foods:', error);
    return [];
  }

  return data || [];
}

/**
 * Get NEVO food by code
 *
 * @param nevoCode - NEVO food code
 * @returns NEVO food data or null
 */
export async function getNevoFoodByCode(nevoCode: number): Promise<any | null> {
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
export function calculateNutriScore(food: any): NutriScoreGrade | null {
  if (!food) return null;

  // Get values per 100g (NEVO data is already per 100g)
  const energyKcal = food.energy_kcal ?? 0;
  const sugarsG = food.sugar_g ?? 0;
  const saturatedFatG = food.saturated_fat_g ?? 0;
  const sodiumMg = food.sodium_mg ?? 0;
  const fiberG = food.fiber_g ?? 0;
  const proteinG = food.protein_g ?? 0;

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
  const foodGroup = (food.food_group_nl || '').toLowerCase();
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
