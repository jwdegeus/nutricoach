"use server";

import { z } from "zod";
import type {
  RequestRecipeAdaptationInput,
  RequestRecipeAdaptationResult,
} from "../recipe-ai.types";
import { RecipeAdaptationService } from "../services/recipe-adaptation.service";

/**
 * Zod schema for request recipe adaptation input validation
 */
const requestRecipeAdaptationInputSchema = z.object({
  recipeId: z.string().min(1, "recipeId is vereist"),
  dietId: z.string().min(1).optional(),
  locale: z.string().optional(),
});

/**
 * Request recipe adaptation
 * 
 * Validates input and returns a mocked adaptation response.
 * In production, this will call the AI service to generate the adaptation.
 * 
 * @param raw - Raw input (will be validated)
 * @returns Discriminated union result with outcome: "success" | "empty" | "error"
 */
export async function requestRecipeAdaptationAction(
  raw: unknown
): Promise<RequestRecipeAdaptationResult> {
  console.log("========================================");
  console.log("[RecipeAI] requestRecipeAdaptationAction called");
  console.log("[RecipeAI] Raw input:", JSON.stringify(raw, null, 2));
  
  try {
    // Validate input
    const validationResult = requestRecipeAdaptationInputSchema.safeParse(raw);

    if (!validationResult.success) {
      console.error("[RecipeAI] Validation failed:", validationResult.error.errors);
      return {
        outcome: "error",
        message: validationResult.error.errors[0]?.message || "Ongeldige invoer",
        code: "INVALID_INPUT",
      };
    }

    // Type assertion is safe here because zod validated the structure
    const input = validationResult.data as RequestRecipeAdaptationInput;
    console.log("[RecipeAI] Validated input:", JSON.stringify(input, null, 2));

    // Use service to handle adaptation request
    console.log("[RecipeAI] Creating RecipeAdaptationService...");
    const service = new RecipeAdaptationService();
    console.log("[RecipeAI] Calling service.requestAdaptation...");
    const result = await service.requestAdaptation(input);
    console.log("[RecipeAI] Service returned:", JSON.stringify({ outcome: result.outcome }, null, 2));
    console.log("========================================");
    return result;
  } catch (error) {
    // Handle unexpected errors
    console.error("[RecipeAI] ERROR in requestRecipeAdaptationAction:", error);
    console.error("[RecipeAI] Error stack:", error instanceof Error ? error.stack : "No stack");
    console.log("========================================");
    return {
      outcome: "error",
      message:
        error instanceof Error
          ? error.message
          : "Er is een onverwachte fout opgetreden",
      code: "INTERNAL_ERROR",
    };
  }
}
