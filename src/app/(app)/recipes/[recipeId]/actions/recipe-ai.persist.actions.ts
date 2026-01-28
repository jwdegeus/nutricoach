'use server';

import { createClient } from '@/src/lib/supabase/server';
import { RecipeAdaptationDbService } from '../services/recipe-adaptation-db.service';
import type { RecipeAdaptationDraft } from '../recipe-ai.types';
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
  analysisViolations: any[];
  rewriteIngredients: any[];
  rewriteSteps: any[];
  confidence: number | null;
  openQuestions: string[];
}): RecipeAdaptationDraft {
  return {
    analysis: {
      violations: record.analysisViolations || [],
      summary: record.analysisSummary || '',
    },
    rewrite: {
      title: record.title,
      ingredients: record.rewriteIngredients || [],
      steps: record.rewriteSteps || [],
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
      typeof (raw as any).adaptationId !== 'string'
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

    // Check enforcement feature flag
    const enforceVNext =
      process.env.ENFORCE_VNEXT_GUARDRAILS_RECIPE_ADAPTATION === 'true';

    if (enforceVNext) {
      // Load adaptation from DB
      const dbService = new RecipeAdaptationDbService();
      const adaptation = await dbService.getAdaptationById(
        adaptationId,
        user.id,
      );

      if (!adaptation) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Aanpassing niet gevonden',
          },
        };
      }

      // Convert record to draft
      const draft = recordToDraft(adaptation);

      try {
        // Load vNext ruleset
        const ruleset = await loadGuardrailsRuleset({
          dietId: adaptation.dietId,
          mode: 'recipe_adaptation',
          locale: 'nl', // Default to nl, could be made configurable
        });

        // Map draft to vNext targets
        const targets = mapRecipeDraftToGuardrailsTargets(draft, 'nl');

        // Build evaluation context
        const context: EvaluationContext = {
          dietKey: adaptation.dietId,
          mode: 'recipe_adaptation',
          locale: 'nl',
          timestamp: new Date().toISOString(),
        };

        // Evaluate guard rails
        const decision = evaluateGuardrails({
          ruleset,
          context,
          targets,
        });

        // Check if apply should be blocked (HARD violations only)
        if (shouldBlockApply(decision)) {
          // Log for monitoring
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

        // SOFT warnings are allowed (decision.ok === true), continue with apply
        // Diagnostics are already in draft (from shadow mode), no need to add here
      } catch (error) {
        // Fail-closed on evaluator/loader errors (policy A: safest)
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

    // Update status (either enforcement is off, or vNext evaluation passed)
    const dbService = new RecipeAdaptationDbService();
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
