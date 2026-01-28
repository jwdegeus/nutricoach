/**
 * Generate Meal Plan Server Action
 *
 * Server action wrapper for the meal planning agent service.
 * Provides app-layer boundary with proper error handling.
 */

'use server';

import { MealPlannerAgentService } from '@/src/lib/agents/meal-planner';
import type { MealPlanResponse } from '@/src/lib/diets';

/**
 * Result type for generate meal plan action
 */
export type GenerateMealPlanActionResult =
  | { ok: true; data: MealPlanResponse }
  | {
      ok: false;
      error: {
        code: 'VALIDATION_ERROR' | 'AGENT_ERROR';
        message: string;
      };
    };

/**
 * Generate a meal plan from raw input
 *
 * Validates input, calls the meal planner agent service, and returns
 * a structured result with proper error handling.
 *
 * @param raw - Raw input (will be validated against MealPlanRequestSchema)
 * @returns Structured result with either data or error
 *
 * @example
 * ```ts
 * const result = await generateMealPlanAction({
 *   dateRange: { start: "2026-01-25", end: "2026-01-31" },
 *   slots: ["breakfast", "lunch", "dinner"],
 *   profile: userProfile,
 * });
 *
 * if (result.ok) {
 *   console.log("Meal plan:", result.data);
 * } else {
 *   console.error("Error:", result.error.message);
 * }
 * ```
 */
export async function generateMealPlanAction(
  raw: unknown,
): Promise<GenerateMealPlanActionResult> {
  try {
    const service = new MealPlannerAgentService();
    const response = await service.generateMealPlan(raw);

    return {
      ok: true,
      data: response,
    };
  } catch (error) {
    // Check if it's a validation error (Zod parse failure)
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Validation errors typically mention "Invalid" or "parse" or "schema"
    if (
      errorMessage.includes('Invalid') ||
      errorMessage.includes('parse') ||
      errorMessage.includes('schema') ||
      errorMessage.includes('validation')
    ) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid meal plan request. Please check your input.',
        },
      };
    }

    // All other errors are agent errors
    return {
      ok: false,
      error: {
        code: 'AGENT_ERROR',
        message: 'Failed to generate meal plan. Please try again later.',
      },
    };
  }
}
