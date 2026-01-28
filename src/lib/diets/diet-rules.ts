/**
 * Diet Rules - Derivation functions
 *
 * Maps DietProfile (onboarding input) to DietRuleSet (agent guard rails).
 * Each diet has its own builder function that creates the appropriate rule set.
 */

import type {
  DietProfile,
  DietRuleSet,
  DietKey,
  ConstraintType,
} from './diet.types';

/**
 * Derives a DietRuleSet from a DietProfile
 *
 * This is the main entry point for converting onboarding data into
 * guard rails for the meal planning agent.
 *
 * @example
 * ```ts
 * const profile: DietProfile = {
 *   dietKey: "wahls_paleo_plus",
 *   allergies: ["nuts"],
 *   calorieTarget: { target: 2000 },
 *   // ... other fields
 * };
 *
 * const ruleSet = deriveDietRuleSet(profile);
 * // ruleSet now contains all guard rails for Wahls Paleo Plus
 * ```
 */
export function deriveDietRuleSet(profile: DietProfile): DietRuleSet {
  // Determine constraint strictness based on profile
  const constraintType: ConstraintType =
    profile.strictness === 'strict' ? 'hard' : 'soft';

  // Route to diet-specific builder
  switch (profile.dietKey) {
    case 'wahls_paleo_plus':
      return buildWahlsPaleoPlusRuleSet(profile, constraintType);
    case 'keto':
      return buildKetoRuleSet(profile, constraintType);
    case 'mediterranean':
      return buildMediterraneanRuleSet(profile, constraintType);
    case 'vegan':
      return buildVeganRuleSet(profile, constraintType);
    case 'balanced':
      return buildBalancedRuleSet(profile, constraintType);
    default:
      // Fallback to balanced if unknown diet
      return buildBalancedRuleSet(profile, constraintType);
  }
}

/**
 * Builds rule set for Wahls Paleo Plus
 *
 * Based on the Wahls Protocol for MS and autoimmune conditions:
 * - 9 cups vegetables daily (3 leafy, 3 sulfur, 3 colored)
 * - Organ meats 2x weekly
 * - Seaweed/kelp daily
 * - Strictly no grains, dairy, legumes, processed sugar
 */
function buildWahlsPaleoPlusRuleSet(
  profile: DietProfile,
  constraintType: ConstraintType,
): DietRuleSet {
  return {
    dietKey: 'wahls_paleo_plus',
    ingredientConstraints: [
      {
        type: 'forbidden',
        items: [],
        categories: ['grains', 'dairy', 'legumes', 'processed_sugar'],
        constraintType: 'hard', // Always hard for Wahls
      },
      // Add user allergies/dislikes as additional constraints
      ...(profile.allergies.length > 0
        ? [
            {
              type: 'forbidden' as const,
              items: profile.allergies,
              constraintType: 'hard' as ConstraintType,
            },
          ]
        : []),
      ...(profile.dislikes.length > 0
        ? [
            {
              type: 'forbidden' as const,
              items: profile.dislikes,
              constraintType: 'soft' as ConstraintType, // Dislikes are soft
            },
          ]
        : []),
    ],
    requiredCategories: [
      {
        category: 'organ_meats',
        minPerWeek: 2,
        items: ['liver', 'heart', 'kidney'],
        constraintType: 'hard',
      },
      {
        category: 'seaweed_kelp',
        minPerDay: 1,
        items: ['seaweed', 'kelp', 'nori', 'wakame'],
        constraintType: 'hard',
      },
    ],
    perMealConstraints: [
      // Ensure protein in main meals
      {
        mealSlot: 'breakfast',
        minProtein: 20, // grams
        constraintType: constraintType,
      },
      {
        mealSlot: 'lunch',
        minProtein: 25,
        constraintType: constraintType,
      },
      {
        mealSlot: 'dinner',
        minProtein: 30,
        constraintType: constraintType,
      },
    ],
    weeklyVariety: {
      maxRepeats: profile.varietyLevel === 'high' ? 1 : 2,
      minUniqueMeals: profile.varietyLevel === 'high' ? 15 : 10,
      excludeSimilar: true,
      constraintType: constraintType,
    },
    macroConstraints: [
      {
        scope: 'daily',
        minProtein: profile.macroTargets?.protein?.min ?? 100, // grams
        minFat: profile.macroTargets?.fat?.min ?? 60,
        constraintType: constraintType,
      },
    ],
    mealStructure: [
      {
        type: 'vegetable_cups',
        vegetableCupsRequirement: {
          totalCups: 9,
          leafyCups: 3,
          sulfurCups: 3,
          coloredCups: 3,
          leafyVegetables: [
            'spinach',
            'kale',
            'lettuce',
            'chard',
            'collard_greens',
            'arugula',
            'bok_choy',
          ],
          sulfurVegetables: [
            'broccoli',
            'cauliflower',
            'cabbage',
            'brussels_sprouts',
            'onion',
            'garlic',
            'leek',
          ],
          coloredVegetables: [
            'carrot',
            'beet',
            'bell_pepper',
            'sweet_potato',
            'pumpkin',
            'squash',
            'tomato',
          ],
        },
        constraintType: 'hard', // Always hard for Wahls
      },
      {
        type: 'meal_count',
        mealCount: {
          minPerDay: 3,
          requiredSlots: ['breakfast', 'lunch', 'dinner'],
        },
        constraintType: constraintType,
      },
    ],
    calorieTarget: profile.calorieTarget,
    prepTimeConstraints: {
      globalMax: profile.prepPreferences.maxPrepMinutes,
      perMeal: profile.prepPreferences.perMeal,
      batchCooking: profile.prepPreferences.batchCooking,
    },
    budgetConstraints: profile.budgetPreference,
    pantryUsage: profile.pantryUsage,
  };
}

/**
 * Builds rule set for Keto diet
 *
 * Key constraints:
 * - Max 20g carbs per day
 * - High fat, moderate protein
 * - No grains, sugar, starchy vegetables
 */
function buildKetoRuleSet(
  profile: DietProfile,
  constraintType: ConstraintType,
): DietRuleSet {
  return {
    dietKey: 'keto',
    ingredientConstraints: [
      {
        type: 'forbidden',
        items: [],
        categories: ['grains', 'sugar', 'starchy_vegetables'],
        constraintType: 'hard',
      },
      ...(profile.allergies.length > 0
        ? [
            {
              type: 'forbidden' as const,
              items: profile.allergies,
              constraintType: 'hard' as ConstraintType,
            },
          ]
        : []),
      ...(profile.dislikes.length > 0
        ? [
            {
              type: 'forbidden' as const,
              items: profile.dislikes,
              constraintType: 'soft' as ConstraintType,
            },
          ]
        : []),
    ],
    requiredCategories: [],
    perMealConstraints: [
      {
        mealSlot: 'breakfast',
        minFat: 15, // grams
        constraintType: constraintType,
      },
      {
        mealSlot: 'lunch',
        minFat: 20,
        constraintType: constraintType,
      },
      {
        mealSlot: 'dinner',
        minFat: 25,
        constraintType: constraintType,
      },
    ],
    weeklyVariety: {
      maxRepeats: profile.varietyLevel === 'high' ? 2 : 3,
      minUniqueMeals: profile.varietyLevel === 'high' ? 12 : 8,
      excludeSimilar: false,
      constraintType: constraintType,
    },
    macroConstraints: [
      {
        scope: 'daily',
        maxCarbs: 20, // grams - hard limit
        minFat: profile.macroTargets?.fat?.min ?? 100,
        minProtein: profile.macroTargets?.protein?.min ?? 70,
        constraintType: 'hard', // Carbs are always hard limit
      },
    ],
    mealStructure: [
      {
        type: 'meal_count',
        mealCount: {
          minPerDay: 2,
          maxPerDay: 4,
        },
        constraintType: constraintType,
      },
    ],
    calorieTarget: profile.calorieTarget,
    prepTimeConstraints: {
      globalMax: profile.prepPreferences.maxPrepMinutes,
      perMeal: profile.prepPreferences.perMeal,
      batchCooking: profile.prepPreferences.batchCooking,
    },
    budgetConstraints: profile.budgetPreference,
    pantryUsage: profile.pantryUsage,
  };
}

/**
 * Builds rule set for Mediterranean diet
 *
 * Key constraints:
 * - Emphasis on vegetables, fruits, whole grains, legumes
 * - Healthy fats (olive oil, nuts)
 * - Moderate fish/poultry, limited red meat
 */
function buildMediterraneanRuleSet(
  profile: DietProfile,
  constraintType: ConstraintType,
): DietRuleSet {
  return {
    dietKey: 'mediterranean',
    ingredientConstraints: [
      {
        type: 'allowed',
        items: [],
        categories: [
          'vegetables',
          'fruits',
          'whole_grains',
          'legumes',
          'fish',
          'poultry',
          'olive_oil',
          'nuts',
        ],
        constraintType: constraintType,
      },
      {
        type: 'forbidden',
        items: [],
        categories: ['processed_foods', 'refined_sugar'],
        constraintType: 'soft',
      },
      ...(profile.allergies.length > 0
        ? [
            {
              type: 'forbidden' as const,
              items: profile.allergies,
              constraintType: 'hard' as ConstraintType,
            },
          ]
        : []),
      ...(profile.dislikes.length > 0
        ? [
            {
              type: 'forbidden' as const,
              items: profile.dislikes,
              constraintType: 'soft' as ConstraintType,
            },
          ]
        : []),
    ],
    requiredCategories: [
      {
        category: 'vegetables',
        minPerDay: 5, // servings
        constraintType: constraintType,
      },
      {
        category: 'healthy_fats',
        minPerDay: 2,
        items: ['olive_oil', 'nuts', 'avocado'],
        constraintType: constraintType,
      },
    ],
    perMealConstraints: [
      {
        mealSlot: 'dinner',
        minProtein: 20,
        constraintType: constraintType,
      },
    ],
    weeklyVariety: {
      maxRepeats: profile.varietyLevel === 'high' ? 2 : 3,
      minUniqueMeals: profile.varietyLevel === 'high' ? 14 : 10,
      excludeSimilar: true,
      constraintType: constraintType,
    },
    macroConstraints: [
      {
        scope: 'daily',
        minProtein: profile.macroTargets?.protein?.min ?? 80,
        minFat: profile.macroTargets?.fat?.min ?? 50,
        constraintType: constraintType,
      },
    ],
    mealStructure: [
      {
        type: 'meal_count',
        mealCount: {
          minPerDay: 3,
          requiredSlots: ['breakfast', 'lunch', 'dinner'],
        },
        constraintType: constraintType,
      },
    ],
    calorieTarget: profile.calorieTarget,
    prepTimeConstraints: {
      globalMax: profile.prepPreferences.maxPrepMinutes,
      perMeal: profile.prepPreferences.perMeal,
      batchCooking: profile.prepPreferences.batchCooking,
    },
    budgetConstraints: profile.budgetPreference,
    pantryUsage: profile.pantryUsage,
  };
}

/**
 * Builds rule set for Vegan diet
 *
 * Key constraints:
 * - No animal products
 * - Focus on plant-based protein sources
 * - Ensure B12 and other nutrients
 */
function buildVeganRuleSet(
  profile: DietProfile,
  constraintType: ConstraintType,
): DietRuleSet {
  return {
    dietKey: 'vegan',
    ingredientConstraints: [
      {
        type: 'forbidden',
        items: [],
        categories: ['meat', 'fish', 'poultry', 'dairy', 'eggs', 'honey'],
        constraintType: 'hard',
      },
      ...(profile.allergies.length > 0
        ? [
            {
              type: 'forbidden' as const,
              items: profile.allergies,
              constraintType: 'hard' as ConstraintType,
            },
          ]
        : []),
      ...(profile.dislikes.length > 0
        ? [
            {
              type: 'forbidden' as const,
              items: profile.dislikes,
              constraintType: 'soft' as ConstraintType,
            },
          ]
        : []),
    ],
    requiredCategories: [
      {
        category: 'plant_protein',
        minPerDay: 3, // servings
        items: ['legumes', 'tofu', 'tempeh', 'seitan', 'nuts', 'seeds'],
        constraintType: constraintType,
      },
    ],
    perMealConstraints: [
      {
        mealSlot: 'breakfast',
        minProtein: 15,
        constraintType: constraintType,
      },
      {
        mealSlot: 'lunch',
        minProtein: 20,
        constraintType: constraintType,
      },
      {
        mealSlot: 'dinner',
        minProtein: 25,
        constraintType: constraintType,
      },
    ],
    weeklyVariety: {
      maxRepeats: profile.varietyLevel === 'high' ? 2 : 3,
      minUniqueMeals: profile.varietyLevel === 'high' ? 14 : 10,
      excludeSimilar: true,
      constraintType: constraintType,
    },
    macroConstraints: [
      {
        scope: 'daily',
        minProtein: profile.macroTargets?.protein?.min ?? 60, // Lower than omnivore
        constraintType: constraintType,
      },
    ],
    mealStructure: [
      {
        type: 'meal_count',
        mealCount: {
          minPerDay: 3,
          requiredSlots: ['breakfast', 'lunch', 'dinner'],
        },
        constraintType: constraintType,
      },
    ],
    calorieTarget: profile.calorieTarget,
    prepTimeConstraints: {
      globalMax: profile.prepPreferences.maxPrepMinutes,
      perMeal: profile.prepPreferences.perMeal,
      batchCooking: profile.prepPreferences.batchCooking,
    },
    budgetConstraints: profile.budgetPreference,
    pantryUsage: profile.pantryUsage,
  };
}

/**
 * Builds rule set for Balanced diet (generic fallback)
 *
 * Minimal constraints, focuses on basic nutrition guidelines
 */
function buildBalancedRuleSet(
  profile: DietProfile,
  constraintType: ConstraintType,
): DietRuleSet {
  return {
    dietKey: 'balanced',
    ingredientConstraints: [
      ...(profile.allergies.length > 0
        ? [
            {
              type: 'forbidden' as const,
              items: profile.allergies,
              constraintType: 'hard' as ConstraintType,
            },
          ]
        : []),
      ...(profile.dislikes.length > 0
        ? [
            {
              type: 'forbidden' as const,
              items: profile.dislikes,
              constraintType: 'soft' as ConstraintType,
            },
          ]
        : []),
    ],
    requiredCategories: [],
    perMealConstraints: [
      {
        mealSlot: 'breakfast',
        minProtein: 15,
        constraintType: constraintType,
      },
      {
        mealSlot: 'lunch',
        minProtein: 20,
        constraintType: constraintType,
      },
      {
        mealSlot: 'dinner',
        minProtein: 25,
        constraintType: constraintType,
      },
    ],
    weeklyVariety: {
      maxRepeats: profile.varietyLevel === 'high' ? 2 : 4,
      minUniqueMeals: profile.varietyLevel === 'high' ? 12 : 7,
      excludeSimilar: false,
      constraintType: constraintType,
    },
    macroConstraints: [
      {
        scope: 'daily',
        minProtein: profile.macroTargets?.protein?.min ?? 50,
        constraintType: constraintType,
      },
    ],
    mealStructure: [
      {
        type: 'meal_count',
        mealCount: {
          minPerDay: 3,
        },
        constraintType: constraintType,
      },
    ],
    calorieTarget: profile.calorieTarget,
    prepTimeConstraints: {
      globalMax: profile.prepPreferences.maxPrepMinutes,
      perMeal: profile.prepPreferences.perMeal,
      batchCooking: profile.prepPreferences.batchCooking,
    },
    budgetConstraints: profile.budgetPreference,
    pantryUsage: profile.pantryUsage,
  };
}
