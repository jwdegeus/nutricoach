/**
 * Meal Planner Enrichment Service
 * 
 * Enriches meal plans with titles, instructions, and cook plans using Gemini AI.
 * Ensures no new ingredients are added - only uses ingredients from the plan.
 */

import { getGeminiClient } from "@/src/lib/ai/gemini/gemini.client";
import { mealPlanResponseSchema } from "@/src/lib/diets/diet.schemas";
import { getNevoFoodByCode } from "@/src/lib/nevo/nutrition-calculator";
import type { MealPlanResponse, Meal } from "@/src/lib/diets";
import type {
  MealPlanEnrichmentResponse,
  MealEnrichmentOptions,
  EnrichedMeal,
} from "./mealPlannerEnrichment.types";
import {
  mealPlanEnrichmentResponseSchema,
  mealEnrichmentOptionsSchema,
  enrichedMealSchema,
} from "./mealPlannerEnrichment.schemas";
import {
  buildMealEnrichmentPrompt,
  buildEnrichmentRepairPrompt,
  buildSingleMealEnrichmentPrompt,
} from "./mealPlannerEnrichment.prompts";
import { validateEnrichment } from "./mealPlannerEnrichment.validate";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * In-memory cache for NEVO food lookups
 * Key: nevoCode (string)
 * Value: { name: string, timestamp: number }
 */
const nevoFoodNameCache = new Map<
  string,
  { name: string; timestamp: number }
>();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get NEVO food name by code (with caching)
 */
async function getNevoFoodName(nevoCode: string): Promise<string> {
  const cached = nevoFoodNameCache.get(nevoCode);

  // Check if cache is valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.name;
  }

  // Fetch from database
  const codeNum = parseInt(nevoCode, 10);
  if (isNaN(codeNum)) {
    return `NEVO ${nevoCode}`;
  }

  const food = await getNevoFoodByCode(codeNum);
  const name = food?.name_nl || food?.name_en || `NEVO ${nevoCode}`;

  // Cache it
  nevoFoodNameCache.set(nevoCode, {
    name,
    timestamp: Date.now(),
  });

  return name;
}

/**
 * Build NEVO food names map
 */
async function buildNevoFoodNamesByCode(
  plan: MealPlanResponse
): Promise<Record<string, string>> {
  const nevoCodes = new Set<string>();

  // Collect all unique NEVO codes
  for (const day of plan.days) {
    for (const meal of day.meals) {
      if (meal.ingredientRefs) {
        for (const ref of meal.ingredientRefs) {
          nevoCodes.add(ref.nevoCode);
        }
      }
    }
  }

  // Fetch names in parallel
  const namePromises = Array.from(nevoCodes).map(async (code) => {
    const name = await getNevoFoodName(code);
    return [code, name] as [string, string];
  });

  const namePairs = await Promise.all(namePromises);
  return Object.fromEntries(namePairs);
}

/**
 * Meal Planner Enrichment Service
 */
export class MealPlannerEnrichmentService {
  /**
   * Enrich a meal plan with titles, instructions, and cook plans
   * 
   * @param raw - Raw meal plan (will be validated)
   * @param options - Enrichment options (optional)
   * @param language - User language preference ('nl' or 'en'), defaults to 'nl'
   * @returns Enriched meal plan
   * @throws Error if validation fails or API call fails after repair attempt
   */
  async enrichPlan(
    raw: unknown,
    options?: unknown,
    language: 'nl' | 'en' = 'nl'
  ): Promise<MealPlanEnrichmentResponse> {
    // Step 1: Validate meal plan input
    let plan: MealPlanResponse;
    try {
      plan = mealPlanResponseSchema.parse(raw);
    } catch (error) {
      throw new Error(
        `Invalid meal plan: ${error instanceof Error ? error.message : "Unknown validation error"}`
      );
    }

    // Step 2: Parse and apply defaults for options
    const enrichmentOptions: MealEnrichmentOptions =
      mealEnrichmentOptionsSchema.parse(options || {});

    // Step 3: Build NEVO food names map (with caching)
    const nevoFoodNamesByCode = await buildNevoFoodNamesByCode(plan);

    // Step 4: Build prompt
    const prompt = buildMealEnrichmentPrompt({
      plan,
      options: enrichmentOptions,
      nevoFoodNamesByCode,
      language,
    });

    // Step 5: Convert Zod schema to JSON schema
    const jsonSchema = zodToJsonSchema(mealPlanEnrichmentResponseSchema, {
      name: "MealPlanEnrichmentResponse",
      target: "openApi3",
    });

    // Step 6: Generate attempt #1
    const gemini = getGeminiClient();
    let rawJson: string;
    try {
      rawJson = await gemini.generateJson({
        prompt,
        jsonSchema,
        temperature: 0.4,
        purpose: "enrich",
      });
    } catch (error) {
      throw new Error(
        `Failed to generate enriched meal plan from Gemini API: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 7: Parse and validate
    const firstAttemptResult = await this.parseAndValidate(
      rawJson,
      plan
    );

    // Step 8: If successful, return
    if (firstAttemptResult.success) {
      return firstAttemptResult.response;
    }

    // Step 9: Repair attempt (max 1 attempt)
    const issues = firstAttemptResult.issues.join("\n");
    const repairPrompt = buildEnrichmentRepairPrompt({
      originalPrompt: prompt,
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
        `Meal plan enrichment failed after repair attempt: API error - ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 10: Parse and validate repair attempt
    const repairResult = await this.parseAndValidate(
      repairRawJson,
      plan
    );

    // Step 11: If repair successful, return
    if (repairResult.success) {
      return repairResult.response;
    }

    // Step 12: Repair failed - throw error
    throw new Error(
      `Meal plan enrichment failed after repair attempt: ${repairResult.issues.join("; ")}`
    );
  }

  /**
   * Parse JSON and validate against schema and enrichment constraints
   * 
   * @param rawJson - Raw JSON string from API
   * @param plan - Original meal plan
   * @returns Parse and validation result
   */
  private async parseAndValidate(
    rawJson: string,
    plan: MealPlanResponse
  ): Promise<{
    success: boolean;
    response?: MealPlanEnrichmentResponse;
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
    let response: MealPlanEnrichmentResponse;
    try {
      response = mealPlanEnrichmentResponseSchema.parse(parsed);
    } catch (error) {
      issues.push(
        `Schema validation error: ${error instanceof Error ? error.message : "Unknown validation error"}`
      );
      return { success: false, issues };
    }

    // Validate enrichment constraints (no new ingredients, etc.)
    const enrichmentIssues = validateEnrichment({
      plan,
      enrichment: response,
    });

    if (enrichmentIssues.length > 0) {
      for (const issue of enrichmentIssues) {
        issues.push(`${issue.code}: ${issue.message} (path: ${issue.path})`);
      }
      return { success: false, issues };
    }

    return { success: true, response, issues: [] };
  }

  /**
   * Enrich a single meal with title, instructions, and timing
   * 
   * @param args - Single meal enrichment arguments
   * @returns Enriched meal
   * @throws Error if validation fails or API call fails after repair attempt
   */
  async enrichMeal(args: {
    date: string;
    mealSlot: string;
    meal: Meal;
    options?: MealEnrichmentOptions;
    language?: 'nl' | 'en';
  }): Promise<EnrichedMeal> {
    const { date, mealSlot, meal, options, language = 'nl' } = args;

    // Step 1: Parse and apply defaults for options
    const enrichmentOptions: MealEnrichmentOptions =
      mealEnrichmentOptionsSchema.parse(options || {});

    // Step 2: Build NEVO food names map for this meal
    const nevoCodes = new Set<string>();
    if (meal.ingredientRefs) {
      for (const ref of meal.ingredientRefs) {
        nevoCodes.add(ref.nevoCode);
      }
    }

    // Fetch names in parallel
    const namePromises = Array.from(nevoCodes).map(async (code) => {
      const name = await getNevoFoodName(code);
      return [code, name] as [string, string];
    });

    const namePairs = await Promise.all(namePromises);
    const nevoFoodNamesByCode = Object.fromEntries(namePairs);

    // Step 3: Build prompt
    const prompt = buildSingleMealEnrichmentPrompt({
      meal,
      options: enrichmentOptions,
      nevoFoodNamesByCode,
      language,
    });

    // Step 4: Convert Zod schema to JSON schema for single meal
    const jsonSchema = zodToJsonSchema(enrichedMealSchema, {
      name: "EnrichedMeal",
      target: "openApi3",
    });

    // Step 5: Generate attempt #1
    const gemini = getGeminiClient();
    let rawJson: string;
    try {
      rawJson = await gemini.generateJson({
        prompt,
        jsonSchema,
        temperature: 0.4,
        purpose: "enrich",
      });
    } catch (error) {
      throw new Error(
        `Failed to generate enriched meal from Gemini API: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 6: Parse and validate
    const firstAttemptResult = await this.parseAndValidateMeal(
      rawJson,
      meal
    );

    // Step 7: If successful, return
    if (firstAttemptResult.success) {
      return firstAttemptResult.response;
    }

    // Step 8: Repair attempt (max 1 attempt)
    const issues = firstAttemptResult.issues.join("\n");
    const repairPrompt = buildEnrichmentRepairPrompt({
      originalPrompt: prompt,
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
        temperature: 0.2,
        purpose: "repair",
      });
    } catch (error) {
      throw new Error(
        `Meal enrichment failed after repair attempt: API error - ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 9: Parse and validate repair attempt
    const repairResult = await this.parseAndValidateMeal(
      repairRawJson,
      meal
    );

    // Step 10: If repair successful, return
    if (repairResult.success) {
      return repairResult.response;
    }

    // Step 11: Repair failed - throw error
    throw new Error(
      `Meal enrichment failed after repair attempt: ${repairResult.issues.join("; ")}`
    );
  }

  /**
   * Parse JSON and validate single meal enrichment
   * 
   * @param rawJson - Raw JSON string from API
   * @param meal - Original meal
   * @returns Parse and validation result
   */
  private async parseAndValidateMeal(
    rawJson: string,
    meal: Meal
  ): Promise<{
    success: boolean;
    response?: EnrichedMeal;
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
    let response: EnrichedMeal;
    try {
      response = enrichedMealSchema.parse(parsed);
    } catch (error) {
      issues.push(
        `Schema validation error: ${error instanceof Error ? error.message : "Unknown validation error"}`
      );
      return { success: false, issues };
    }

    // Validate that date and mealSlot match
    if (response.date !== meal.date) {
      issues.push(
        `Date mismatch: enriched meal date (${response.date}) does not match meal date (${meal.date})`
      );
    }
    if (response.mealSlot !== meal.slot) {
      issues.push(
        `Meal slot mismatch: enriched meal slot (${response.mealSlot}) does not match meal slot (${meal.slot})`
      );
    }

    // Validate that no new ingredients are added
    const allowedCodes = new Set<string>();
    if (meal.ingredientRefs) {
      for (const ref of meal.ingredientRefs) {
        allowedCodes.add(ref.nevoCode);
      }
    }

    for (let codeIndex = 0; codeIndex < response.ingredientNevoCodesUsed.length; codeIndex++) {
      const code = response.ingredientNevoCodesUsed[codeIndex];
      if (!allowedCodes.has(code)) {
        issues.push(
          `NEW_INGREDIENT: NEVO code ${code} is not in the meal's ingredient list (ingredientNevoCodesUsed[${codeIndex}])`
        );
      }
    }

    // Validate time estimates
    const totalTime = response.prepTimeMin + response.cookTimeMin;
    if (totalTime > 240) {
      issues.push(
        `BAD_TIME_ESTIMATE: Total time (prep + cook) exceeds 240 minutes: ${totalTime} minutes`
      );
    }

    if (issues.length > 0) {
      return { success: false, issues };
    }

    return { success: true, response, issues: [] };
  }
}
