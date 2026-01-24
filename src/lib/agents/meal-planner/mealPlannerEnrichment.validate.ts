/**
 * Meal Planner Enrichment Validator
 * 
 * Validates enriched meal plans to ensure no new ingredients are added
 * and all constraints are met.
 */

import type { MealPlanResponse } from "@/src/lib/diets";
import type { MealPlanEnrichmentResponse } from "./mealPlannerEnrichment.types";

/**
 * Validation issue found in enrichment
 */
export type EnrichmentIssue = {
  path: string; // e.g., "meals[0].ingredientNevoCodesUsed[1]"
  code:
    | "NEW_INGREDIENT"
    | "UNKNOWN_NEVO_CODE"
    | "MISSING_MEAL"
    | "BAD_TIME_ESTIMATE";
  message: string;
};

/**
 * Find meal in plan by date and slot
 */
function findMealInPlan(
  plan: MealPlanResponse,
  date: string,
  mealSlot: string
): MealPlanResponse["days"][0]["meals"][0] | undefined {
  for (const day of plan.days) {
    if (day.date === date) {
      for (const meal of day.meals) {
        if (meal.slot === mealSlot) {
          return meal;
        }
      }
    }
  }
  return undefined;
}

/**
 * Get allowed NEVO codes for a meal
 */
function getAllowedNevoCodes(
  meal: MealPlanResponse["days"][0]["meals"][0]
): Set<string> {
  const codes = new Set<string>();
  if (meal.ingredientRefs) {
    for (const ref of meal.ingredientRefs) {
      codes.add(ref.nevoCode);
    }
  }
  return codes;
}

/**
 * Validate enrichment
 * 
 * Checks:
 * 1. All meals from plan have corresponding enriched meals
 * 2. ingredientNevoCodesUsed only contains codes from meal's ingredientRefs
 * 3. No new ingredients are added
 * 4. Time estimates are reasonable
 * 
 * @param args - Validation arguments
 * @returns Array of validation issues (empty if all constraints are met)
 */
export function validateEnrichment(args: {
  plan: MealPlanResponse;
  enrichment: MealPlanEnrichmentResponse;
}): EnrichmentIssue[] {
  const { plan, enrichment } = args;
  const issues: EnrichmentIssue[] = [];

  // Create map of enriched meals by date+slot
  const enrichedMealMap = new Map<string, MealPlanEnrichmentResponse["meals"][0]>();
  for (const meal of enrichment.meals) {
    const key = `${meal.date}:${meal.mealSlot}`;
    enrichedMealMap.set(key, meal);
  }

  // Validate each meal in plan has corresponding enriched meal
  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    const day = plan.days[dayIndex];
    for (let mealIndex = 0; mealIndex < day.meals.length; mealIndex++) {
      const meal = day.meals[mealIndex];
      const key = `${meal.date}:${meal.slot}`;
      const enrichedMeal = enrichedMealMap.get(key);

      if (!enrichedMeal) {
        issues.push({
          path: `plan.days[${dayIndex}].meals[${mealIndex}]`,
          code: "MISSING_MEAL",
          message: `No enriched meal found for date ${meal.date}, slot ${meal.slot}`,
        });
        continue;
      }

      // Get allowed NEVO codes for this meal
      const allowedCodes = getAllowedNevoCodes(meal);

      // Validate ingredientNevoCodesUsed
      for (
        let codeIndex = 0;
        codeIndex < enrichedMeal.ingredientNevoCodesUsed.length;
        codeIndex++
      ) {
        const code = enrichedMeal.ingredientNevoCodesUsed[codeIndex];
        const path = `enrichment.meals[${enrichment.meals.indexOf(enrichedMeal)}].ingredientNevoCodesUsed[${codeIndex}]`;

        if (!allowedCodes.has(code)) {
          issues.push({
            path,
            code: "NEW_INGREDIENT",
            message: `NEVO code ${code} is not in the meal's ingredient list (date: ${meal.date}, slot: ${meal.slot})`,
          });
        }
      }

      // Validate time estimates
      const totalTime = enrichedMeal.prepTimeMin + enrichedMeal.cookTimeMin;
      if (totalTime > 240) {
        issues.push({
          path: `enrichment.meals[${enrichment.meals.indexOf(enrichedMeal)}]`,
          code: "BAD_TIME_ESTIMATE",
          message: `Total time (prep + cook) exceeds 240 minutes: ${totalTime} minutes (date: ${meal.date}, slot: ${meal.slot})`,
        });
      }
    }
  }

  // Validate all enriched meals correspond to plan meals
  for (let mealIndex = 0; mealIndex < enrichment.meals.length; mealIndex++) {
    const enrichedMeal = enrichment.meals[mealIndex];
    const planMeal = findMealInPlan(plan, enrichedMeal.date, enrichedMeal.mealSlot);

    if (!planMeal) {
      issues.push({
        path: `enrichment.meals[${mealIndex}]`,
        code: "UNKNOWN_NEVO_CODE",
        message: `Enriched meal does not match any meal in plan (date: ${enrichedMeal.date}, slot: ${enrichedMeal.mealSlot})`,
      });
      continue;
    }

    // Validate ingredientNevoCodesUsed against plan meal
    const allowedCodes = getAllowedNevoCodes(planMeal);
    for (
      let codeIndex = 0;
      codeIndex < enrichedMeal.ingredientNevoCodesUsed.length;
      codeIndex++
    ) {
      const code = enrichedMeal.ingredientNevoCodesUsed[codeIndex];
      if (!allowedCodes.has(code)) {
        issues.push({
          path: `enrichment.meals[${mealIndex}].ingredientNevoCodesUsed[${codeIndex}]`,
          code: "UNKNOWN_NEVO_CODE",
          message: `NEVO code ${code} is not in the plan meal's ingredient list`,
        });
      }
    }
  }

  return issues;
}
