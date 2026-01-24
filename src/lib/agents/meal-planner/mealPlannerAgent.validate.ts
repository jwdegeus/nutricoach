/**
 * Hard Constraint Validator
 * 
 * Validates that a generated meal plan adheres to hard constraints
 * from the diet rule set. This is a "best effort" enforcement that
 * will be refined later with NEVO codes and taxonomy.
 */

import type {
  MealPlanResponse,
  MealPlanRequest,
  DietRuleSet,
  MealPlanDay,
} from "@/src/lib/diets";
import {
  calcMealMacros,
  calcDayMacros,
  verifyNevoCode,
  adjustDayQuantitiesToTargets,
} from "./mealPlannerAgent.tools";

/**
 * Validation issue found in the meal plan
 */
export type ValidationIssue = {
  path: string; // e.g., "days[0].meals[0].ingredients[2]"
  code:
    | "FORBIDDEN_INGREDIENT"
    | "ALLERGEN_PRESENT"
    | "DISLIKED_INGREDIENT"
    | "MISSING_REQUIRED_CATEGORY"
    | "INVALID_NEVO_CODE"
    | "CALORIE_TARGET_MISS"
    | "MACRO_TARGET_MISS"
    | "MEAL_PREFERENCE_MISS";
  message: string;
};

/**
 * Case-insensitive substring match
 */
function matchesIngredient(
  ingredientName: string,
  searchTerm: string
): boolean {
  return ingredientName.toLowerCase().includes(searchTerm.toLowerCase());
}

/**
 * Check if an ingredient matches any forbidden items or categories
 */
function isForbiddenIngredient(
  ingredientName: string,
  tags: string[] | undefined,
  rules: DietRuleSet
): boolean {
  // Check hard ingredient constraints
  for (const constraint of rules.ingredientConstraints) {
    if (constraint.constraintType !== "hard") continue;
    if (constraint.type !== "forbidden") continue;

    // Check items
    if (constraint.items.length > 0) {
      for (const item of constraint.items) {
        if (matchesIngredient(ingredientName, item)) {
          return true;
        }
      }
    }

    // Check categories via tags
    if (constraint.categories && tags) {
      for (const category of constraint.categories) {
        if (tags.some((tag) => matchesIngredient(tag, category))) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if an ingredient matches user allergies
 */
function isAllergen(
  ingredientName: string,
  tags: string[] | undefined,
  allergies: string[]
): boolean {
  for (const allergen of allergies) {
    if (matchesIngredient(ingredientName, allergen)) {
      return true;
    }
    // Also check tags
    if (tags) {
      for (const tag of tags) {
        if (matchesIngredient(tag, allergen)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Check if an ingredient matches user dislikes
 */
function isDisliked(
  ingredientName: string,
  tags: string[] | undefined,
  dislikes: string[]
): boolean {
  for (const dislike of dislikes) {
    if (matchesIngredient(ingredientName, dislike)) {
      return true;
    }
    // Also check tags
    if (tags) {
      for (const tag of tags) {
        if (matchesIngredient(tag, dislike)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Check if required categories are present in a day's meals
 */
function checkRequiredCategories(
  dayMeals: MealPlanResponse["days"][0]["meals"],
  rules: DietRuleSet
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const required of rules.requiredCategories) {
    if (required.constraintType !== "hard") continue;

    // Check if category is present in any meal of the day
    let found = false;
    for (const meal of dayMeals) {
      for (const ingredient of meal.ingredients) {
        // Check if ingredient name matches required items
        if (required.items && required.items.length > 0) {
          for (const item of required.items) {
            if (matchesIngredient(ingredient.name, item)) {
              found = true;
              break;
            }
          }
        }

        // Check if ingredient tags match required category
        if (ingredient.tags) {
          for (const tag of ingredient.tags) {
            if (matchesIngredient(tag, required.category)) {
              found = true;
              break;
            }
          }
        }

        if (found) break;
      }
      if (found) break;
    }

    // If minPerDay is specified and not found, create issue
    if (required.minPerDay && !found) {
      issues.push({
        path: `day[${dayMeals[0]?.date || "unknown"}]`,
        code: "MISSING_REQUIRED_CATEGORY",
        message: `Required category "${required.category}" (min ${required.minPerDay}/day) not found in any meal`,
      });
    }
  }

  return issues;
}

/**
 * Validate NEVO codes in ingredient references
 */
async function validateNevoCodes(
  plan: MealPlanResponse
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    const day = plan.days[dayIndex];

    for (let mealIndex = 0; mealIndex < day.meals.length; mealIndex++) {
      const meal = day.meals[mealIndex];

      // Validate ingredientRefs if present
      if (meal.ingredientRefs && meal.ingredientRefs.length > 0) {
        for (
          let refIndex = 0;
          refIndex < meal.ingredientRefs.length;
          refIndex++
        ) {
          const ref = meal.ingredientRefs[refIndex];
          const path = `days[${dayIndex}].meals[${mealIndex}].ingredientRefs[${refIndex}]`;

          // Verify NEVO code exists
          const isValid = await verifyNevoCode(ref.nevoCode);
          if (!isValid) {
            issues.push({
              path,
              code: "INVALID_NEVO_CODE",
              message: `Invalid NEVO code: ${ref.nevoCode} (not found in database)`,
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Validate macro targets for a day
 */
async function validateDayMacros(
  dayMeals: MealPlanResponse["days"][0]["meals"],
  dayIndex: number,
  rules: DietRuleSet,
  request: MealPlanRequest
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  // Only validate if there are hard macro constraints or hard calorie targets
  const hasHardMacroConstraints = rules.macroConstraints.some(
    (c) => c.constraintType === "hard"
  );
  const hasHardCalorieTarget =
    rules.calorieTarget.min !== undefined ||
    rules.calorieTarget.max !== undefined;

  if (!hasHardMacroConstraints && !hasHardCalorieTarget) {
    return issues; // No hard macro/calorie constraints, skip validation
  }

  // Calculate actual macros for the day
  const dayMacros = await calcDayMacros(dayMeals);
  const dayPath = `days[${dayIndex}]`;

  // Check calorie target (hard constraint)
  if (hasHardCalorieTarget) {
    if (
      rules.calorieTarget.min !== undefined &&
      dayMacros.calories < rules.calorieTarget.min
    ) {
      issues.push({
        path: dayPath,
        code: "CALORIE_TARGET_MISS",
        message: `Day calories (${dayMacros.calories.toFixed(0)}) below minimum target (${rules.calorieTarget.min})`,
      });
    }
    if (
      rules.calorieTarget.max !== undefined &&
      dayMacros.calories > rules.calorieTarget.max
    ) {
      issues.push({
        path: dayPath,
        code: "CALORIE_TARGET_MISS",
        message: `Day calories (${dayMacros.calories.toFixed(0)}) above maximum target (${rules.calorieTarget.max})`,
      });
    }
  }

  // Check macro constraints (hard constraints only)
  for (const macroConstraint of rules.macroConstraints) {
    if (macroConstraint.constraintType !== "hard") continue;
    if (macroConstraint.scope !== "daily") continue;

    if (
      macroConstraint.maxCarbs !== undefined &&
      dayMacros.carbsG > macroConstraint.maxCarbs
    ) {
      issues.push({
        path: dayPath,
        code: "MACRO_TARGET_MISS",
        message: `Day carbs (${dayMacros.carbsG.toFixed(1)}g) exceed maximum (${macroConstraint.maxCarbs}g)`,
      });
    }

    if (
      macroConstraint.minProtein !== undefined &&
      dayMacros.proteinG < macroConstraint.minProtein
    ) {
      issues.push({
        path: dayPath,
        code: "MACRO_TARGET_MISS",
        message: `Day protein (${dayMacros.proteinG.toFixed(1)}g) below minimum (${macroConstraint.minProtein}g)`,
      });
    }

    if (
      macroConstraint.minFat !== undefined &&
      dayMacros.fatG < macroConstraint.minFat
    ) {
      issues.push({
        path: dayPath,
        code: "MACRO_TARGET_MISS",
        message: `Day fat (${dayMacros.fatG.toFixed(1)}g) below minimum (${macroConstraint.minFat}g)`,
      });
    }
  }

  return issues;
}

/**
 * Validate hard constraints in a meal plan
 * 
 * Checks for:
 * - Forbidden ingredients (from diet rules)
 * - Allergens (from user profile)
 * - Disliked ingredients (from user profile)
 * - Missing required categories (from diet rules)
 * - Invalid NEVO codes (if ingredientRefs are present)
 * - Macro/calorie target violations (hard constraints only)
 * 
 * @param args - Validation arguments
 * @returns Array of validation issues (empty if all constraints are met)
 */
export async function validateHardConstraints(args: {
  plan: MealPlanResponse;
  rules: DietRuleSet;
  request: MealPlanRequest;
}): Promise<ValidationIssue[]> {
  const { plan, rules, request } = args;
  const issues: ValidationIssue[] = [];

  // Get allergies and dislikes from profile
  const allergies = request.profile.allergies;
  const dislikes = request.profile.dislikes;

  // Validate each day
  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    const day = plan.days[dayIndex];

    // Validate each meal in the day
    for (let mealIndex = 0; mealIndex < day.meals.length; mealIndex++) {
      const meal = day.meals[mealIndex];
      const mealPath = `days[${dayIndex}].meals[${mealIndex}]`;

      // Validate meal preferences (hard constraint)
      const mealPreferences = request.profile.mealPreferences;
      if (mealPreferences) {
        const slotPreferences = mealPreferences[meal.slot as keyof typeof mealPreferences];
        if (slotPreferences && slotPreferences.length > 0) {
          const { mealMatchesPreferences } = await import(
            "@/src/lib/meal-history/mealPreferenceMatcher"
          );
          const matches = mealMatchesPreferences(
            meal,
            meal.slot,
            slotPreferences
          );
          if (!matches) {
            issues.push({
              path: mealPath,
              code: "MEAL_PREFERENCE_MISS",
              message: `Meal "${meal.name}" does not match required preferences for ${meal.slot}: ${slotPreferences.join(", ")}`,
            });
          }
        }
      }

      // Validate legacy ingredients if present (backward compatibility)
      if (meal.ingredients && meal.ingredients.length > 0) {
        for (
          let ingredientIndex = 0;
          ingredientIndex < meal.ingredients.length;
          ingredientIndex++
        ) {
          const ingredient = meal.ingredients[ingredientIndex];
          const path = `days[${dayIndex}].meals[${mealIndex}].ingredients[${ingredientIndex}]`;

          // Check for allergens (hard constraint)
          if (isAllergen(ingredient.name, ingredient.tags, allergies)) {
            issues.push({
              path,
              code: "ALLERGEN_PRESENT",
              message: `Ingredient "${ingredient.name}" contains or matches an allergen: ${allergies
                .filter((a) => matchesIngredient(ingredient.name, a))
                .join(", ")}`,
            });
          }

          // Check for disliked ingredients (hard constraint - user preference)
          if (isDisliked(ingredient.name, ingredient.tags, dislikes)) {
            issues.push({
              path,
              code: "DISLIKED_INGREDIENT",
              message: `Ingredient "${ingredient.name}" is in the user's dislikes list`,
            });
          }

          // Check for forbidden ingredients from diet rules
          if (
            isForbiddenIngredient(ingredient.name, ingredient.tags, rules)
          ) {
            issues.push({
              path,
              code: "FORBIDDEN_INGREDIENT",
              message: `Ingredient "${ingredient.name}" is forbidden by diet rules`,
            });
          }
        }
      }

      // Validate ingredientRefs (new contract)
      if (meal.ingredientRefs && meal.ingredientRefs.length > 0) {
        for (
          let refIndex = 0;
          refIndex < meal.ingredientRefs.length;
          refIndex++
        ) {
          const ref = meal.ingredientRefs[refIndex];
          const path = `days[${dayIndex}].meals[${mealIndex}].ingredientRefs[${refIndex}]`;

          // Check displayName against allergens/dislikes/forbidden (if provided)
          if (ref.displayName) {
            if (isAllergen(ref.displayName, ref.tags, allergies)) {
              issues.push({
                path,
                code: "ALLERGEN_PRESENT",
                message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) contains or matches an allergen`,
              });
            }

            if (isDisliked(ref.displayName, ref.tags, dislikes)) {
              issues.push({
                path,
                code: "DISLIKED_INGREDIENT",
                message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) is in the user's dislikes list`,
              });
            }

            if (
              isForbiddenIngredient(ref.displayName, ref.tags, rules)
            ) {
              issues.push({
                path,
                code: "FORBIDDEN_INGREDIENT",
                message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) is forbidden by diet rules`,
              });
            }
          }
        }
      }
    }

    // Check required categories for the day
    const categoryIssues = checkRequiredCategories(day.meals, rules);
    issues.push(...categoryIssues);

    // Validate day macros (async)
    const macroIssues = await validateDayMacros(
      day.meals,
      dayIndex,
      rules,
      request
    );
    issues.push(...macroIssues);
  }

    // Validate NEVO codes (async)
    const nevoCodeIssues = await validateNevoCodes(plan);
    issues.push(...nevoCodeIssues);

  return issues;
}

/**
 * Validate hard constraints for a single day
 * 
 * Similar to validateHardConstraints but for a single day only.
 * Used in partial regenerate scenarios.
 * 
 * @param args - Validation arguments for a single day
 * @returns Array of validation issues (empty if all constraints are met)
 */
export async function validateDayHardConstraints(args: {
  day: MealPlanDay;
  rules: DietRuleSet;
  request: MealPlanRequest;
  dayIndex?: number; // Optional day index for path generation
}): Promise<ValidationIssue[]> {
  const { day, rules, request, dayIndex = 0 } = args;
  const issues: ValidationIssue[] = [];

  // Get allergies and dislikes from profile
  const allergies = request.profile.allergies;
  const dislikes = request.profile.dislikes;

  // Validate each meal in the day
  for (let mealIndex = 0; mealIndex < day.meals.length; mealIndex++) {
    const meal = day.meals[mealIndex];
    const mealPath = `days[${dayIndex}].meals[${mealIndex}]`;

    // Validate meal preferences (hard constraint)
    const mealPreferences = request.profile.mealPreferences;
    if (mealPreferences) {
      const slotPreferences = mealPreferences[meal.slot as keyof typeof mealPreferences];
      if (slotPreferences && slotPreferences.length > 0) {
        const { mealMatchesPreferences } = await import(
          "@/src/lib/meal-history/mealPreferenceMatcher"
        );
        const matches = mealMatchesPreferences(
          meal,
          meal.slot,
          slotPreferences
        );
        if (!matches) {
          issues.push({
            path: mealPath,
            code: "MEAL_PREFERENCE_MISS",
            message: `Meal "${meal.name}" does not match required preferences for ${meal.slot}: ${slotPreferences.join(", ")}`,
          });
        }
      }
    }

    // Validate legacy ingredients if present (backward compatibility)
    if (meal.ingredients && meal.ingredients.length > 0) {
      for (
        let ingredientIndex = 0;
        ingredientIndex < meal.ingredients.length;
        ingredientIndex++
      ) {
        const ingredient = meal.ingredients[ingredientIndex];
        const path = `days[${dayIndex}].meals[${mealIndex}].ingredients[${ingredientIndex}]`;

        // Check for allergens (hard constraint)
        if (isAllergen(ingredient.name, ingredient.tags, allergies)) {
          issues.push({
            path,
            code: "ALLERGEN_PRESENT",
            message: `Ingredient "${ingredient.name}" contains or matches an allergen: ${allergies
              .filter((a) => matchesIngredient(ingredient.name, a))
              .join(", ")}`,
          });
        }

        // Check for disliked ingredients (hard constraint - user preference)
        if (isDisliked(ingredient.name, ingredient.tags, dislikes)) {
          issues.push({
            path,
            code: "DISLIKED_INGREDIENT",
            message: `Ingredient "${ingredient.name}" is in the user's dislikes list`,
          });
        }

        // Check for forbidden ingredients from diet rules
        if (
          isForbiddenIngredient(ingredient.name, ingredient.tags, rules)
        ) {
          issues.push({
            path,
            code: "FORBIDDEN_INGREDIENT",
            message: `Ingredient "${ingredient.name}" is forbidden by diet rules`,
          });
        }
      }
    }

    // Validate ingredientRefs (new contract)
    if (meal.ingredientRefs && meal.ingredientRefs.length > 0) {
      for (
        let refIndex = 0;
        refIndex < meal.ingredientRefs.length;
        refIndex++
      ) {
        const ref = meal.ingredientRefs[refIndex];
        const path = `days[${dayIndex}].meals[${mealIndex}].ingredientRefs[${refIndex}]`;

        // Check displayName against allergens/dislikes/forbidden (if provided)
        if (ref.displayName) {
          if (isAllergen(ref.displayName, ref.tags, allergies)) {
            issues.push({
              path,
              code: "ALLERGEN_PRESENT",
              message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) contains or matches an allergen`,
            });
          }

          if (isDisliked(ref.displayName, ref.tags, dislikes)) {
            issues.push({
              path,
              code: "DISLIKED_INGREDIENT",
              message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) is in the user's dislikes list`,
            });
          }

          if (
            isForbiddenIngredient(ref.displayName, ref.tags, rules)
          ) {
            issues.push({
              path,
              code: "FORBIDDEN_INGREDIENT",
              message: `Ingredient "${ref.displayName}" (nevoCode: ${ref.nevoCode}) is forbidden by diet rules`,
            });
          }
        }

        // Verify NEVO code exists
        const isValidCode = await verifyNevoCode(ref.nevoCode);
        if (!isValidCode) {
          issues.push({
            path,
            code: "INVALID_NEVO_CODE",
            message: `Invalid NEVO code: ${ref.nevoCode}`,
          });
        }
      }
    }
  }

  // Check required categories for the day
  const categoryIssues = checkRequiredCategories(day.meals, rules);
  issues.push(...categoryIssues);

  // Validate day macros (async)
  const macroIssues = await validateDayMacros(
    day.meals,
    dayIndex,
    rules,
    request
  );
  issues.push(...macroIssues);

  return issues;
}

/**
 * Validate and optionally adjust day macros deterministically
 * 
 * Validates day macros and if only macro issues exist, attempts
 * deterministic quantity adjustment before returning issues.
 * 
 * @param args - Day validation arguments
 * @returns Validation result with optional adjusted day
 */
export async function validateAndAdjustDayMacros(args: {
  day: MealPlanDay;
  rules: DietRuleSet;
  request: MealPlanRequest;
  allowAdjustment?: boolean; // If true, attempt deterministic adjustment for macro-only issues
}): Promise<{
  issues: ValidationIssue[];
  adjustedDay?: MealPlanDay;
  adjustments?: Array<{ nevoCode: string; oldG: number; newG: number }>;
}> {
  const { day, rules, request, allowAdjustment = true } = args;

  // First, validate all constraints
  const allIssues = await validateDayHardConstraints({
    day,
    rules,
    request,
  });

  // Check if only macro issues exist (no ingredient/constraint violations)
  const macroOnlyIssues = allIssues.filter(
    (issue) => issue.code === "CALORIE_TARGET_MISS" || issue.code === "MACRO_TARGET_MISS"
  );
  const nonMacroIssues = allIssues.filter(
    (issue) => issue.code !== "CALORIE_TARGET_MISS" && issue.code !== "MACRO_TARGET_MISS"
  );

  // If there are non-macro issues, return all issues (can't fix with adjustment)
  if (nonMacroIssues.length > 0) {
    return { issues: allIssues };
  }

  // If only macro issues and adjustment is allowed, try deterministic adjustment
  if (macroOnlyIssues.length > 0 && allowAdjustment) {
    // Build targets from rules
    const targets: {
      calories?: { min: number; max: number };
      proteinG?: { min: number; max: number };
      carbsG?: { max: number };
      fatG?: { min: number; max: number };
    } = {};

    if (rules.calorieTarget.min || rules.calorieTarget.max) {
      targets.calories = {
        min: rules.calorieTarget.min ?? 0,
        max: rules.calorieTarget.max ?? 10000,
      };
    }

    // Extract macro constraints
    for (const macro of rules.macroConstraints) {
      if (macro.constraintType === "hard" && macro.scope === "daily") {
        if (macro.minProtein !== undefined) {
          targets.proteinG = { ...targets.proteinG, min: macro.minProtein };
        }
        if (macro.maxCarbs !== undefined) {
          targets.carbsG = { max: macro.maxCarbs };
        }
        if (macro.minFat !== undefined) {
          targets.fatG = { ...targets.fatG, min: macro.minFat };
        }
        if (macro.maxFat !== undefined) {
          targets.fatG = { ...targets.fatG, max: macro.maxFat };
        }
      }
    }

    // Attempt adjustment
    try {
      const { day: adjustedDay, adjustments } = await adjustDayQuantitiesToTargets({
        day,
        targets,
      });

      // Re-validate adjusted day
      const adjustedIssues = await validateDayHardConstraints({
        day: adjustedDay,
        rules,
        request,
      });

      // If adjustment fixed all issues, return success
      if (adjustedIssues.length === 0) {
        return {
          issues: [],
          adjustedDay,
          adjustments,
        };
      }

      // If adjustment helped but didn't fix everything, return adjusted day with remaining issues
      // (This allows the repair loop to continue with better starting point)
      return {
        issues: adjustedIssues,
        adjustedDay,
        adjustments,
      };
    } catch (error) {
      // Adjustment failed - return original issues
      console.warn("Deterministic macro adjustment failed:", error);
      return { issues: allIssues };
    }
  }

  // No adjustment attempted or not allowed - return original issues
  return { issues: allIssues };
}
