'use server';

import { createClient } from '@/src/lib/supabase/server';
import { RecipeAdaptationDbService } from '../services/recipe-adaptation-db.service';
import type {
  RecipeAdaptationDraft,
  ViolationDetail,
  IngredientLine,
  StepLine,
} from '../recipe-ai.types';
import type { ValidationReport } from '../services/diet-validator';
// vNext guard rails enforcement
import {
  loadGuardrailsRuleset,
  evaluateGuardrails,
} from '@/src/lib/guardrails-vnext';
import { mapRecipeDraftToGuardrailsTargets } from '@/src/lib/guardrails-vnext/adapters/recipe-adaptation';
import type {
  GuardDecision,
  EvaluationContext,
} from '@/src/lib/guardrails-vnext/types';

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code:
          | 'AUTH_ERROR'
          | 'VALIDATION_ERROR'
          | 'DB_ERROR'
          | 'INTERNAL_ERROR'
          | 'GUARDRAILS_VIOLATION';
        message: string;
        details?: {
          outcome: 'blocked';
          reasonCodes: string[];
          contentHash: string;
          rulesetVersion?: number;
        };
      };
    };

/**
 * Get user's current diet ID
 *
 * @returns Diet ID (diet_type_id from active profile) or null
 */
export async function getCurrentDietIdAction(): Promise<
  ActionResult<{ dietId: string; dietName: string } | null>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    // Get active diet profile
    const { data: profile, error: profileError } = await supabase
      .from('user_diet_profiles')
      .select('diet_type_id, diet_types!inner(name)')
      .eq('user_id', user.id)
      .is('ends_on', null)
      .maybeSingle();

    if (profileError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Fout bij ophalen dieetprofiel',
        },
      };
    }

    if (!profile?.diet_type_id) {
      return {
        ok: true,
        data: null, // No diet selected
      };
    }

    const dietTypesRow = profile.diet_types as
      | { name: string }[]
      | { name: string }
      | null;
    const dietName = Array.isArray(dietTypesRow)
      ? dietTypesRow[0]?.name
      : (dietTypesRow as { name: string } | null)?.name;

    return {
      ok: true,
      data: {
        dietId: profile.diet_type_id,
        dietName: dietName || 'Onbekend',
      },
    };
  } catch (error) {
    console.error('Error in getCurrentDietIdAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Persist recipe adaptation draft
 *
 * Creates or updates a recipe adaptation record and creates a run record.
 *
 * @param raw - Raw input (will be validated)
 * @returns ActionResult with adaptation ID
 */
export async function persistRecipeAdaptationDraftAction(
  raw: unknown,
): Promise<ActionResult<{ adaptationId: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om aanpassingen op te slaan',
        },
      };
    }

    // Validate input
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('recipeId' in raw) ||
      !('dietId' in raw) ||
      !('draft' in raw)
    ) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ongeldige invoer',
        },
      };
    }

    const input = raw as {
      recipeId: string;
      dietId: string;
      draft: RecipeAdaptationDraft;
      validationReport?: ValidationReport;
      meta?: {
        timestamp?: string;
        locale?: string;
      };
    };

    if (!input.recipeId || !input.dietId || !input.draft) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'recipeId, dietId en draft zijn vereist',
        },
      };
    }

    // Upsert adaptation
    const dbService = new RecipeAdaptationDbService();
    const adaptation = await dbService.upsertAdaptation({
      userId: user.id,
      recipeId: input.recipeId,
      dietId: input.dietId,
      status: 'draft',
      adaptation: input.draft,
    });

    // Create run record
    // If validation report not provided, create a minimal one
    const validationReport: ValidationReport = input.validationReport || {
      ok: true,
      matches: [],
      summary: 'No validation report available',
    };

    await dbService.createRun({
      recipeAdaptationId: adaptation.id,
      inputSnapshot: {
        recipeId: input.recipeId,
        dietId: input.dietId,
        locale: input.meta?.locale,
      },
      outputSnapshot: input.draft,
      validationReport,
      outcome: 'success',
    });

    return {
      ok: true,
      data: { adaptationId: adaptation.id },
    };
  } catch (error) {
    console.error('Error in persistRecipeAdaptationDraftAction:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij opslaan aanpassing',
      },
    };
  }
}

/**
 * Helper: Check if guard decision should block apply
 *
 * HARD blocks prevent apply, SOFT warnings do not.
 *
 * @param decision - Guard decision from vNext evaluator
 * @returns True if apply should be blocked
 */
function shouldBlockApply(decision: GuardDecision): boolean {
  // HARD blocks prevent apply (ok === false means hard block)
  return !decision.ok;
}

/**
 * Convert RecipeAdaptationRecord to RecipeAdaptationDraft
 *
 * @param record - Database record
 * @returns Recipe adaptation draft
 */
function recordToDraft(record: {
  title: string;
  analysisSummary: string | null;
  analysisViolations: unknown[];
  rewriteIngredients: unknown[];
  rewriteSteps: unknown[];
  rewriteIntro?: string | null;
  rewriteWhyThisWorks?: string[];
  confidence: number | null;
  openQuestions: string[];
}): RecipeAdaptationDraft {
  return {
    analysis: {
      violations: (record.analysisViolations || []) as ViolationDetail[],
      summary: record.analysisSummary || '',
    },
    rewrite: {
      title: record.title,
      ingredients: (record.rewriteIngredients || []) as IngredientLine[],
      steps: (record.rewriteSteps || []) as StepLine[],
      intro: record.rewriteIntro ?? undefined,
      whyThisWorks: Array.isArray(record.rewriteWhyThisWorks)
        ? record.rewriteWhyThisWorks
        : undefined,
    },
    confidence: record.confidence ?? undefined,
    openQuestions: record.openQuestions || [],
  };
}

/**
 * Apply recipe adaptation
 *
 * Updates the status of a recipe adaptation to 'applied'.
 *
 * When ENFORCE_VNEXT_GUARDRAILS_RECIPE_ADAPTATION is enabled, evaluates
 * vNext guard rails and blocks apply if HARD violations are detected.
 *
 * @param raw - Raw input (will be validated)
 * @returns ActionResult
 */
export async function applyRecipeAdaptationAction(
  raw: unknown,
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn om aanpassingen toe te passen',
        },
      };
    }

    // Validate input
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('adaptationId' in raw) ||
      typeof (raw as Record<string, unknown>).adaptationId !== 'string'
    ) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'adaptationId is vereist',
        },
      };
    }

    const { adaptationId } = raw as { adaptationId: string };

    const dbService = new RecipeAdaptationDbService();

    // Always load adaptation to get recipe_id and rewrite data
    const adaptation = await dbService.getAdaptationById(adaptationId, user.id);

    if (!adaptation) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Aanpassing niet gevonden',
        },
      };
    }

    // Check enforcement feature flag
    const enforceVNext =
      process.env.ENFORCE_VNEXT_GUARDRAILS_RECIPE_ADAPTATION === 'true';

    if (enforceVNext) {
      const draft = recordToDraft(adaptation);

      try {
        const ruleset = await loadGuardrailsRuleset({
          dietId: adaptation.dietId,
          mode: 'recipe_adaptation',
          locale: 'nl',
        });

        const targets = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

        const context: EvaluationContext = {
          dietKey: adaptation.dietId,
          mode: 'recipe_adaptation',
          locale: 'nl',
          timestamp: new Date().toISOString(),
        };

        const decision = evaluateGuardrails({
          ruleset,
          context,
          targets,
        });

        if (shouldBlockApply(decision)) {
          console.log(
            `[RecipeAdaptation] vNext guard rails blocked apply: adaptationId=${adaptationId}, dietId=${adaptation.dietId}, outcome=${decision.outcome}, reasonCodes=${decision.reasonCodes.join(',')}, hash=${ruleset.contentHash}`,
          );

          return {
            ok: false,
            error: {
              code: 'GUARDRAILS_VIOLATION',
              message: 'Deze aanpassing voldoet niet aan de dieetregels',
              details: {
                outcome: 'blocked',
                reasonCodes: decision.reasonCodes,
                contentHash: ruleset.contentHash,
                rulesetVersion: ruleset.version,
              },
            },
          };
        }
      } catch (error) {
        console.error(
          `[RecipeAdaptation] vNext guard rails evaluation error: adaptationId=${adaptationId}, error=${error instanceof Error ? error.message : String(error)}`,
        );

        return {
          ok: false,
          error: {
            code: 'GUARDRAILS_VIOLATION',
            message: 'Fout bij evalueren dieetregels',
            details: {
              outcome: 'blocked',
              reasonCodes: ['EVALUATOR_ERROR'],
              contentHash: '',
              rulesetVersion: undefined,
            },
          },
        };
      }
    }

    // Apply adapted ingredients and steps to the meal (recipe_id = meal id)
    const recipeId = adaptation.recipeId;
    const ingredients = adaptation.rewriteIngredients || [];
    const steps = adaptation.rewriteSteps || [];

    if (ingredients.length === 0 && steps.length === 0) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Geen ingrediënten of bereidingsstappen in deze aanpassing',
        },
      };
    }

    // Find meal in custom_meals or meal_history
    const { data: customMeal } = await supabase
      .from('custom_meals')
      .select(
        'id, meal_data, ai_analysis, meal_data_original, ai_analysis_original',
      )
      .eq('id', recipeId)
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: historyMeal } = await supabase
      .from('meal_history')
      .select('id, meal_data, ai_analysis')
      .eq('id', recipeId)
      .eq('user_id', user.id)
      .maybeSingle();

    const mealRow = customMeal ?? historyMeal;
    const tableName = customMeal ? 'custom_meals' : 'meal_history';

    if (!mealRow) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Recept niet gevonden om aanpassing op toe te passen',
        },
      };
    }

    const currentMealData =
      (mealRow.meal_data as Record<string, unknown>) || {};
    const currentAiAnalysis =
      (mealRow.ai_analysis as Record<string, unknown>) || {};

    const updatedMealData = {
      ...currentMealData,
      ingredients: ingredients.map(
        (ing: {
          name: string;
          quantity: string;
          unit?: string;
          note?: string;
          section?: string | null;
        }) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit ?? null,
          note: ing.note ?? null,
          original_line: ing.name,
          section: ing.section ?? null,
        }),
      ),
      ingredientRefs: [],
    };

    const updatedAiAnalysis = {
      ...currentAiAnalysis,
      instructions: steps.map(
        (s: { step?: number; text?: string }, i: number) => ({
          step: s?.step ?? i + 1,
          text:
            (s && typeof s === 'object' && 'text' in s ? s.text : String(s)) ??
            '',
        }),
      ),
    };

    // Voor custom_meals: bewaar origineel vóór eerste aanpassing (versies)
    const updatePayload: Record<string, unknown> = {
      meal_data: updatedMealData,
      ai_analysis: updatedAiAnalysis,
      updated_at: new Date().toISOString(),
    };
    const mealRowWithOriginal = mealRow as {
      meal_data_original?: unknown;
      ai_analysis_original?: unknown;
    };
    if (
      tableName === 'custom_meals' &&
      mealRowWithOriginal.meal_data_original == null
    ) {
      updatePayload.meal_data_original = currentMealData;
      updatePayload.ai_analysis_original = currentAiAnalysis;
    }

    const { error: updateMealError } = await supabase
      .from(tableName)
      .update(updatePayload)
      .eq('id', recipeId)
      .eq('user_id', user.id);

    if (updateMealError) {
      console.error(
        '[RecipeAdaptation] Failed to update meal:',
        updateMealError,
      );
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Kon recept niet bijwerken: ${updateMealError.message}`,
        },
      };
    }

    // Onthoud gekozen substituties voor volgende keer (snellere suggesties)
    const substitutionPairs = (
      adaptation as {
        substitutionPairs?: Array<{
          originalName: string;
          substituteName: string;
        }>;
      }
    ).substitutionPairs;
    if (substitutionPairs?.length) {
      const normalize = (s: string) =>
        s.toLowerCase().trim().replace(/\s+/g, ' ');
      try {
        for (const p of substitutionPairs) {
          const originalNormalized = normalize(p.originalName);
          if (!originalNormalized || !p.substituteName?.trim()) continue;
          await supabase.from('diet_ingredient_substitutions').upsert(
            {
              user_id: user.id,
              diet_id: adaptation.dietId,
              original_normalized: originalNormalized,
              substitute_display_name: p.substituteName.trim(),
            },
            {
              onConflict: 'user_id,diet_id,original_normalized',
            },
          );
        }
      } catch {
        // Tabel of migratie nog niet aanwezig; negeer, apply is al gelukt
      }
    }

    await dbService.updateStatus(adaptationId, user.id, 'applied');

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error('Error in applyRecipeAdaptationAction:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij toepassen aanpassing',
      },
    };
  }
}

/**
 * Check whether the current user has an applied adaptation for this recipe,
 * and return advisory content (intro + whyThisWorks) for the recipe page.
 *
 * @param raw - Raw input: { recipeId: string }
 * @returns ActionResult with hasAppliedAdaptation and optional intro/whyThisWorks
 */
export async function getHasAppliedAdaptationAction(raw: unknown): Promise<
  ActionResult<{
    hasAppliedAdaptation: boolean;
    intro?: string;
    whyThisWorks?: string[];
  }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    if (
      !raw ||
      typeof raw !== 'object' ||
      !('recipeId' in raw) ||
      typeof (raw as { recipeId: string }).recipeId !== 'string'
    ) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'recipeId is vereist',
        },
      };
    }

    const { recipeId } = raw as { recipeId: string };
    const dbService = new RecipeAdaptationDbService();
    const adaptation = await dbService.getAppliedAdaptationForRecipe(
      recipeId,
      user.id,
    );

    if (!adaptation) {
      return {
        ok: true,
        data: { hasAppliedAdaptation: false },
      };
    }

    return {
      ok: true,
      data: {
        hasAppliedAdaptation: true,
        intro: adaptation.rewriteIntro ?? undefined,
        whyThisWorks:
          Array.isArray(adaptation.rewriteWhyThisWorks) &&
          adaptation.rewriteWhyThisWorks.length > 0
            ? adaptation.rewriteWhyThisWorks
            : undefined,
      },
    };
  } catch (error) {
    console.error('Error in getHasAppliedAdaptationAction:', error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Remove applied recipe adaptation
 *
 * Reverts the recipe (custom_meal) to the original version (meal_data_original /
 * ai_analysis_original) and deletes the adaptation record.
 *
 * @param raw - Raw input: { recipeId: string }
 * @returns ActionResult
 */
export async function removeRecipeAdaptationAction(
  raw: unknown,
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message:
            'Je moet ingelogd zijn om de aangepaste versie te verwijderen',
        },
      };
    }

    if (
      !raw ||
      typeof raw !== 'object' ||
      !('recipeId' in raw) ||
      typeof (raw as { recipeId: string }).recipeId !== 'string'
    ) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'recipeId is vereist',
        },
      };
    }

    const { recipeId } = raw as { recipeId: string };
    const dbService = new RecipeAdaptationDbService();

    const adaptation = await dbService.getAppliedAdaptationForRecipe(
      recipeId,
      user.id,
    );

    if (!adaptation) {
      return {
        ok: true,
        data: undefined,
      };
    }

    const { data: customMeal } = await supabase
      .from('custom_meals')
      .select('id, meal_data_original, ai_analysis_original')
      .eq('id', recipeId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (
      customMeal?.meal_data_original != null ||
      customMeal?.ai_analysis_original != null
    ) {
      const updatePayload: Record<string, unknown> = {
        meal_data: customMeal.meal_data_original ?? {},
        ai_analysis: customMeal.ai_analysis_original ?? {},
        meal_data_original: null,
        ai_analysis_original: null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('custom_meals')
        .update(updatePayload)
        .eq('id', recipeId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('[RecipeAdaptation] Failed to revert meal:', updateError);
        return {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: `Kon recept niet terugzetten: ${updateError.message}`,
          },
        };
      }
    }

    await dbService.deleteAdaptation(adaptation.id, user.id);

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    console.error('Error in removeRecipeAdaptationAction:', error);
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij verwijderen aangepaste versie',
      },
    };
  }
}
