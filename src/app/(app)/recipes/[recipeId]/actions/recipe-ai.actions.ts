'use server';

import { z } from 'zod';
import type {
  RequestRecipeAdaptationInput,
  RequestRecipeAdaptationResult,
  GetRecipeAnalysisInput,
  GetRecipeAnalysisResult,
} from '../recipe-ai.types';
import { RecipeAdaptationService } from '../services/recipe-adaptation.service';

/**
 * Zod schema for request recipe adaptation input validation
 */
const requestRecipeAdaptationInputSchema = z.object({
  recipeId: z.string().min(1, 'recipeId is vereist'),
  dietId: z.string().min(1).optional(),
  locale: z.string().optional(),
  existingAnalysis: z
    .object({
      violations: z.array(
        z.object({
          ingredientName: z.string(),
          ruleCode: z.string(),
          ruleLabel: z.string(),
          suggestion: z.string(),
          allowedAlternativeInText: z.string().optional(),
          matchedForbiddenTerm: z.string().optional(),
        }),
      ),
      recipeName: z.string(),
      violationChoices: z
        .array(
          z.object({
            choice: z.enum(['use_allowed', 'substitute', 'remove', 'keep']),
            substitute: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

/**
 * Zod schema for get recipe analysis input
 */
const getRecipeAnalysisInputSchema = z.object({
  recipeId: z.string().min(1, 'recipeId is vereist'),
  dietId: z.string().min(1, 'dietId is vereist'),
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
  raw: unknown,
): Promise<RequestRecipeAdaptationResult> {
  console.log('========================================');
  console.log('[RecipeAI] requestRecipeAdaptationAction called');
  console.log('[RecipeAI] Raw input:', JSON.stringify(raw, null, 2));

  try {
    // Validate input
    const validationResult = requestRecipeAdaptationInputSchema.safeParse(raw);

    if (!validationResult.success) {
      console.error(
        '[RecipeAI] Validation failed:',
        validationResult.error.errors,
      );
      return {
        outcome: 'error',
        message:
          validationResult.error.errors[0]?.message || 'Ongeldige invoer',
        code: 'INVALID_INPUT',
      };
    }

    // Type assertion is safe here because zod validated the structure
    const input = validationResult.data as RequestRecipeAdaptationInput;
    console.log('[RecipeAI] Validated input:', JSON.stringify(input, null, 2));

    // Use service to handle adaptation request
    console.log('[RecipeAI] Creating RecipeAdaptationService...');
    const service = new RecipeAdaptationService();
    console.log('[RecipeAI] Calling service.requestAdaptation...');
    const result = await service.requestAdaptation(input);
    console.log(
      '[RecipeAI] Service returned:',
      JSON.stringify({ outcome: result.outcome }, null, 2),
    );
    console.log('========================================');
    return result;
  } catch (error) {
    // Handle unexpected errors
    console.error('[RecipeAI] ERROR in requestRecipeAdaptationAction:', error);
    console.error(
      '[RecipeAI] Error stack:',
      error instanceof Error ? error.stack : 'No stack',
    );
    console.log('========================================');
    return {
      outcome: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Er is een onverwachte fout opgetreden',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * Alleen recept analyseren tegen dieetregels (geen AI-rewrite).
 * Fase 1 van twee-fase flow: snel violations + advies uit dieetregels tonen.
 */
export async function getRecipeAnalysisAction(
  raw: unknown,
): Promise<GetRecipeAnalysisResult> {
  try {
    const parsed = getRecipeAnalysisInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.errors[0]?.message ?? 'Ongeldige invoer',
        },
      };
    }
    const { recipeId, dietId } = parsed.data as GetRecipeAnalysisInput;
    if (!dietId) {
      return {
        ok: false,
        error: {
          code: 'NO_DIET_SELECTED',
          message: 'Selecteer eerst een dieettype in je instellingen.',
        },
      };
    }
    const service = new RecipeAdaptationService();
    const data = await service.getAnalysisOnly(recipeId, dietId);
    return { ok: true, data };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Er is een fout opgetreden bij de analyse.';
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message },
    };
  }
}
