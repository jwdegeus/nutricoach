/**
 * Meal Planner Agent Service
 * 
 * End-to-end service for generating meal plans using Gemini AI
 * with structured output and Zod validation.
 */

import { getGeminiClient } from "@/src/lib/ai/gemini/gemini.client";
import {
  mealPlanRequestSchema,
  mealPlanResponseSchema,
  mealPlanDayResponseSchema,
  mealResponseSchema,
  deriveDietRuleSet,
  type MealPlanRequest,
  type MealPlanResponse,
  type MealPlanDay,
  type MealPlanDayResponse,
  type Meal,
  type MealResponse,
} from "@/src/lib/diets";
import { buildMealPlanPrompt, buildMealPlanDayPrompt, buildMealPrompt } from "./mealPlannerAgent.prompts";
import { buildRepairPrompt } from "./mealPlannerAgent.repair";
import {
  validateHardConstraints,
  validateAndAdjustDayMacros,
  validateDayHardConstraints,
} from "./mealPlannerAgent.validate";
import {
  buildCandidatePool,
  type CandidatePool,
} from "./mealPlannerAgent.tools";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Simple in-memory cache for candidate pools
 * Key: dietKey + excludeTerms joined
 * Value: { pool, timestamp }
 */
const candidatePoolCache = new Map<
  string,
  { pool: CandidatePool; timestamp: number }
>();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get or build candidate pool (with caching)
 */
async function getCandidatePool(
  dietKey: string,
  excludeTerms: string[]
): Promise<CandidatePool> {
  const cacheKey = `${dietKey}:${excludeTerms.sort().join(",")}`;
  const cached = candidatePoolCache.get(cacheKey);

  // Check if cache is valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.pool;
  }

  // Build new pool
  const pool = await buildCandidatePool(dietKey, excludeTerms);

  // Cache it
  candidatePoolCache.set(cacheKey, {
    pool,
    timestamp: Date.now(),
  });

  return pool;
}

/**
 * Meal Planner Agent Service
 * 
 * Generates meal plans using Gemini AI with strict schema validation.
 * 
 * @example
 * ```ts
 * const service = new MealPlannerAgentService();
 * const response = await service.generateMealPlan({
 *   dateRange: { start: "2026-01-25", end: "2026-01-31" },
 *   slots: ["breakfast", "lunch", "dinner"],
 *   profile: dietProfile, // From onboarding
 * });
 * ```
 */
export class MealPlannerAgentService {
  /**
   * Generate a meal plan from raw input
   * 
   * Validates input, builds prompt, calls Gemini API with schema,
   * validates output, and attempts one repair if needed.
   * 
   * @param raw - Raw input (will be validated against MealPlanRequestSchema)
   * @param language - User language preference ('nl' or 'en'), defaults to 'nl'
   * @returns Validated MealPlanResponse
   * @throws Error if validation fails or API call fails after repair attempt
   */
  async generateMealPlan(raw: unknown, language: 'nl' | 'en' = 'nl'): Promise<MealPlanResponse> {
    // Step 1: Validate input request
    let request: MealPlanRequest;
    try {
      request = mealPlanRequestSchema.parse(raw);
    } catch (error) {
      throw new Error(
        `Invalid meal plan request: ${error instanceof Error ? error.message : "Unknown validation error"}`
      );
    }

    // Step 2: Derive rules from profile (security/consistency: onboarding is source of truth)
    // We never trust dietRuleSet from input - always derive from profile to ensure consistency
    const rules = deriveDietRuleSet(request.profile);

    // Step 3: Build candidate pool (with caching)
    const excludeTerms = [
      ...request.profile.allergies,
      ...request.profile.dislikes,
      ...(request.excludeIngredients || []),
    ];
    const candidates = await getCandidatePool(
      request.profile.dietKey,
      excludeTerms
    );

    // Step 4: Build original prompt with candidates
    const originalPrompt = buildMealPlanPrompt({
      request,
      rules,
      candidates,
      language,
    });

    // Step 5: Convert Zod schema to JSON schema
    const jsonSchema = zodToJsonSchema(mealPlanResponseSchema, {
      name: "MealPlanResponse",
      target: "openApi3",
    });

    // Step 6: Generate attempt #1
    const gemini = getGeminiClient();
    let rawJson: string;
    try {
      rawJson = await gemini.generateJson({
        prompt: originalPrompt,
        jsonSchema,
        temperature: 0.4,
        purpose: "plan",
      });
    } catch (error) {
      throw new Error(
        `Failed to generate meal plan from Gemini API: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 7: Try to parse and validate
    const firstAttemptResult = await this.parseAndValidate(
      rawJson,
      request,
      rules
    );

    // Step 8: If successful, return
    if (firstAttemptResult.success) {
      return firstAttemptResult.response;
    }

    // Step 9: Repair attempt (max 1 attempt)
    const issues = firstAttemptResult.issues.join("\n");
    const repairPrompt = buildRepairPrompt({
      originalPrompt,
      badOutput: rawJson,
      issues,
      responseJsonSchema: jsonSchema,
    });

    // Call Gemini with lower temperature for repair
    let repairRawJson: string;
    try {
      repairRawJson = await gemini.generateJson({
        prompt: repairPrompt,
        jsonSchema,
        temperature: 0.2, // Lower temperature for more deterministic repair
        purpose: "repair",
      });
    } catch (error) {
      throw new Error(
        `Meal plan generation failed after repair attempt: API error - ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 10: Parse and validate repair attempt
    const repairResult = await this.parseAndValidate(
      repairRawJson,
      request,
      rules
    );

    // Step 11: If repair successful, return
    if (repairResult.success) {
      return repairResult.response;
    }

    // Step 12: Repair failed - throw error
    throw new Error(
      `Meal plan generation failed after repair attempt: ${repairResult.issues.join("; ")}`
    );
  }

  /**
   * Parse JSON and validate against schema and hard constraints
   * 
   * @param rawJson - Raw JSON string from API
   * @param request - Original meal plan request
   * @param rules - Diet rule set
   * @returns Parse and validation result
   */
  private async parseAndValidate(
    rawJson: string,
    request: MealPlanRequest,
    rules: ReturnType<typeof deriveDietRuleSet>
  ): Promise<{
    success: boolean;
    response?: MealPlanResponse;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Try JSON parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (error) {
      issues.push(
        `JSON parse error: ${error instanceof Error ? error.message : "Unknown parse error"}`
      );
      return { success: false, issues };
    }

    // Try Zod schema validation
    let response: MealPlanResponse;
    try {
      response = mealPlanResponseSchema.parse(parsed);
    } catch (error) {
      issues.push(
        `Schema validation error: ${error instanceof Error ? error.message : "Unknown validation error"}`
      );
      return { success: false, issues };
    }

    // Validate hard constraints (now async - includes NEVO code validation and macro checks)
    const constraintIssues = await validateHardConstraints({
      plan: response,
      rules,
      request,
    });

    if (constraintIssues.length > 0) {
      for (const issue of constraintIssues) {
        issues.push(`${issue.code}: ${issue.message} (path: ${issue.path})`);
      }
      return { success: false, issues };
    }

    return { success: true, response, issues: [] };
  }

  /**
   * Generate a single day of meals
   * 
   * Generates meals for one specific date. Supports minimal-change
   * objective if existingDay is provided. Uses deterministic macro
   * adjustment before repair attempts to reduce LLM calls.
   * 
   * @param args - Day generation arguments
   * @returns Generated day with optional adjustments metadata
   */
  async generateMealPlanDay(args: {
    request: MealPlanRequest;
    date: string;
    existingDay?: MealPlanDay;
    language?: 'nl' | 'en';
  }): Promise<{
    day: MealPlanDay;
    adjustments?: Array<{ nevoCode: string; oldG: number; newG: number }>;
  }> {
    const { request, date, existingDay, language = 'nl' } = args;

    // Step 1: Derive rules from profile
    const rules = deriveDietRuleSet(request.profile);

    // Step 2: Build candidate pool
    const excludeTerms = [
      ...request.profile.allergies,
      ...request.profile.dislikes,
      ...(request.excludeIngredients || []),
    ];
    const candidates = await getCandidatePool(
      request.profile.dietKey,
      excludeTerms
    );

    // Step 3: Build day prompt with minimal-change instructions if existingDay provided
    const dayPrompt = buildMealPlanDayPrompt({
      date,
      request,
      rules,
      candidates,
      existingDay,
      language,
    });

    // Step 4: Convert Zod schema to JSON schema for single day
    const jsonSchema = zodToJsonSchema(mealPlanDayResponseSchema, {
      name: "MealPlanDayResponse",
      target: "openApi3",
    });

    // Step 5: Generate attempt #1
    const gemini = getGeminiClient();
    let rawJson: string;
    try {
      rawJson = await gemini.generateJson({
        prompt: dayPrompt,
        jsonSchema,
        temperature: 0.4,
        purpose: "plan",
      });
    } catch (error) {
      throw new Error(
        `Failed to generate meal plan day from Gemini API: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 6: Parse JSON
    let day: MealPlanDay;
    try {
      const parsed = JSON.parse(rawJson);
      const dayResponse: MealPlanDayResponse = mealPlanDayResponseSchema.parse(parsed);
      day = {
        date: dayResponse.date,
        meals: dayResponse.meals,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse meal plan day: ${error instanceof Error ? error.message : "Unknown parse error"}`
      );
    }

    // Step 7: Validate and attempt deterministic macro adjustment
    const validationResult = await validateAndAdjustDayMacros({
      day,
      rules,
      request,
      allowAdjustment: true,
    });

    // If adjustment was successful, use adjusted day
    if (validationResult.adjustedDay && validationResult.adjustments) {
      day = validationResult.adjustedDay;
      // If all issues resolved, return early
      if (validationResult.issues.length === 0) {
        return {
          day,
          adjustments: validationResult.adjustments,
        };
      }
    }

    // Step 8: If still has issues, attempt repair (max 1 attempt)
    if (validationResult.issues.length > 0) {
      const issues = validationResult.issues.map(
        (issue) => `${issue.code}: ${issue.message} (path: ${issue.path})`
      );
      const repairPrompt = buildRepairPrompt({
        originalPrompt: dayPrompt,
        badOutput: rawJson,
        issues: issues.join("\n"),
        responseJsonSchema: jsonSchema,
      });

      // Call Gemini with lower temperature for repair
      let repairRawJson: string;
      try {
        repairRawJson = await gemini.generateJson({
          prompt: repairPrompt,
          jsonSchema,
          temperature: 0.2,
          purpose: "repair",
        });
      } catch (error) {
        throw new Error(
          `Meal plan day generation failed after repair attempt: API error - ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      // Parse repair attempt
      try {
        const parsed = JSON.parse(repairRawJson);
        const dayResponse: MealPlanDayResponse = mealPlanDayResponseSchema.parse(parsed);
        day = {
          date: dayResponse.date,
          meals: dayResponse.meals,
        };
      } catch (error) {
        throw new Error(
          `Failed to parse repaired meal plan day: ${error instanceof Error ? error.message : "Unknown parse error"}`
        );
      }

      // Validate repair attempt (with adjustment if needed)
      const repairValidationResult = await validateAndAdjustDayMacros({
        day,
        rules,
        request,
        allowAdjustment: true,
      });

      // Use adjusted day if available
      if (repairValidationResult.adjustedDay) {
        day = repairValidationResult.adjustedDay;
      }

      // If still has issues after repair, throw error
      if (repairValidationResult.issues.length > 0) {
        const remainingIssues = repairValidationResult.issues.map(
          (issue) => `${issue.code}: ${issue.message}`
        );
        throw new Error(
          `Meal plan day generation failed after repair attempt: ${remainingIssues.join("; ")}`
        );
      }

      // Return with adjustments if any
      return {
        day,
        adjustments: repairValidationResult.adjustments,
      };
    }

    // Step 9: Success - return day with adjustments if any
    return {
      day,
      adjustments: validationResult.adjustments,
    };
  }

  /**
   * Generate a single meal (slot-only)
   * 
   * Generates one meal for a specific date and slot. Supports minimal-change
   * objective if existingMeal is provided. Validates hard constraints and
   * optionally adjusts macros for calorie target.
   * 
   * @param args - Meal generation arguments
   * @returns Generated meal with optional adjustments metadata
   */
  async generateMeal(args: {
    request: MealPlanRequest;
    date: string;
    mealSlot: string;
    existingMeal?: Meal;
    constraints?: {
      maxPrepMinutes?: number;
      targetCalories?: number;
      highProtein?: boolean;
      vegetarian?: boolean;
      avoidIngredients?: string[];
    };
    language?: 'nl' | 'en';
  }): Promise<{
    meal: Meal;
    adjustments?: Array<{ nevoCode: string; oldG: number; newG: number }>;
  }> {
    const { request, date, mealSlot, existingMeal, constraints, language = 'nl' } = args;

    // Step 1: Derive rules from profile
    const rules = deriveDietRuleSet(request.profile);

    // Step 2: Build candidate pool
    const excludeTerms = [
      ...request.profile.allergies,
      ...request.profile.dislikes,
      ...(request.excludeIngredients || []),
      ...(constraints?.avoidIngredients || []),
    ];
    const candidates = await getCandidatePool(
      request.profile.dietKey,
      excludeTerms
    );

    // Step 3: Build meal prompt
    const mealPrompt = buildMealPrompt({
      date,
      mealSlot,
      request,
      rules,
      candidates,
      existingMeal,
      constraints,
      language,
    });

    // Step 4: Convert Zod schema to JSON schema for single meal
    const jsonSchema = zodToJsonSchema(mealResponseSchema, {
      name: "MealResponse",
      target: "openApi3",
    });

    // Step 5: Generate attempt #1
    const gemini = getGeminiClient();
    let rawJson: string;
    try {
      rawJson = await gemini.generateJson({
        prompt: mealPrompt,
        jsonSchema,
        temperature: 0.4,
        purpose: "plan",
      });
    } catch (error) {
      throw new Error(
        `Failed to generate meal from Gemini API: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 6: Parse JSON
    let mealResponse: MealResponse;
    try {
      const parsed = JSON.parse(rawJson);
      mealResponse = mealResponseSchema.parse(parsed);
    } catch (error) {
      throw new Error(
        `Failed to parse meal: ${error instanceof Error ? error.message : "Unknown parse error"}`
      );
    }

    let meal = mealResponse.meal;

    // Step 7: Validate hard constraints for the meal
    // Create a temporary day with just this meal for validation
    const tempDay: MealPlanDay = {
      date,
      meals: [meal],
    };

    const validationResult = await validateDayHardConstraints({
      day: tempDay,
      rules,
      request,
      dayIndex: 0,
    });

    // Step 8: If only calorie/macro issues and constraints.targetCalories is set, attempt adjustment
    if (validationResult.length > 0 && constraints?.targetCalories) {
      const macroOnlyIssues = validationResult.filter(
        (issue) => issue.code === "CALORIE_TARGET_MISS" || issue.code === "MACRO_TARGET_MISS"
      );
      const nonMacroIssues = validationResult.filter(
        (issue) => issue.code !== "CALORIE_TARGET_MISS" && issue.code !== "MACRO_TARGET_MISS"
      );

      // If only macro issues, try to adjust quantities
      if (macroOnlyIssues.length > 0 && nonMacroIssues.length === 0) {
        const { calcMealMacros } = await import("./mealPlannerAgent.tools");
        const currentMacros = await calcMealMacros(
          meal.ingredientRefs.map((ref) => ({
            nevoCode: ref.nevoCode,
            quantityG: ref.quantityG,
          }))
        );

        // Simple scaling: adjust all quantities proportionally to meet calorie target
        if (currentMacros.calories > 0) {
          const scale = constraints.targetCalories / currentMacros.calories;
          const adjustments: Array<{ nevoCode: string; oldG: number; newG: number }> = [];

          meal = {
            ...meal,
            ingredientRefs: meal.ingredientRefs.map((ref) => {
              const oldG = ref.quantityG;
              const newG = Math.max(1, Math.round(ref.quantityG * scale));
              adjustments.push({ nevoCode: ref.nevoCode, oldG, newG });
              return { ...ref, quantityG: newG };
            }),
          };

          // Re-validate after adjustment
          const tempDayAdjusted: MealPlanDay = {
            date,
            meals: [meal],
          };
          const adjustedValidationResult = await validateDayHardConstraints({
            day: tempDayAdjusted,
            rules,
            request,
            dayIndex: 0,
          });

          // If adjustment fixed issues, return with adjustments
          if (adjustedValidationResult.length === 0) {
            return { meal, adjustments };
          }
        }
      }
    }

    // Step 9: If still has issues, attempt repair (max 1 attempt)
    if (validationResult.length > 0) {
      const issues = validationResult.map(
        (issue) => `${issue.code}: ${issue.message} (path: ${issue.path})`
      );
      const repairPrompt = buildRepairPrompt({
        originalPrompt: mealPrompt,
        badOutput: rawJson,
        issues: issues.join("\n"),
        responseJsonSchema: jsonSchema,
      });

      // Call Gemini with lower temperature for repair
      let repairRawJson: string;
      try {
        repairRawJson = await gemini.generateJson({
          prompt: repairPrompt,
          jsonSchema,
          temperature: 0.2,
          purpose: "repair",
        });
      } catch (error) {
        throw new Error(
          `Meal generation failed after repair attempt: API error - ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      // Parse repair attempt
      try {
        const parsed = JSON.parse(repairRawJson);
        mealResponse = mealResponseSchema.parse(parsed);
        meal = mealResponse.meal;
      } catch (error) {
        throw new Error(
          `Failed to parse repaired meal: ${error instanceof Error ? error.message : "Unknown parse error"}`
        );
      }

      // Re-validate repair attempt
      const tempDayRepaired: MealPlanDay = {
        date,
        meals: [meal],
      };
      const repairValidationResult = await validateDayHardConstraints({
        day: tempDayRepaired,
        rules,
        request,
        dayIndex: 0,
      });

      // If still has issues after repair, throw error
      if (repairValidationResult.length > 0) {
        const remainingIssues = repairValidationResult.map(
          (issue) => `${issue.code}: ${issue.message}`
        );
        throw new Error(
          `Meal generation failed after repair attempt: ${remainingIssues.join("; ")}`
        );
      }
    }

    // Step 10: Success - return meal
    return { meal };
  }
}
