'use server';

import { z } from 'zod';
import { createClient } from '@/src/lib/supabase/server';
import {
  loadGuardrailsRuleset,
  evaluateGuardrails,
} from '@/src/lib/guardrails-vnext';
import { loadMagicianOverrides } from '@/src/lib/diet-validation/magician-overrides.loader';
import { mapMealPlanToGuardrailsTargets } from '@/src/lib/guardrails-vnext/adapters/meal-planner';
import type {
  EvaluationContext,
  GuardRule,
} from '@/src/lib/guardrails-vnext/types';
import type {
  MealPlanResponse,
  MealPlanDay,
  Meal,
  MealSlot,
} from '@/src/lib/diets';
import { mealSlotSchema } from '@/src/lib/diets/diet.schemas';

/** Explicit columns for start-review check/update (no SELECT *) */
const MEAL_PLAN_REVIEW_COLUMNS = 'id,status,plan_snapshot,draft_plan_snapshot';

/** Explicit columns for apply-draft check + guardrails (diet_key for ruleset load) */
const MEAL_PLAN_APPLY_COLUMNS = 'id,status,draft_plan_snapshot,diet_key';

/** Minimal columns for cancel-review check (no SELECT *) */
const MEAL_PLAN_CANCEL_COLUMNS = 'id,status';

/** Minimal columns for user_preferences when loading household for apply-draft guardrails */
const USER_PREFS_HOUSEHOLD_COLUMN = 'household_id';

/** Columns for household_avoid_rules when building apply-draft guardrails (no SELECT *) */
const HOUSEHOLD_AVOID_RULES_APPLY_COLUMNS =
  'match_mode,match_value,strictness,rule_type';

/** Priority for household hard rules so they always win over diet rules */
const HOUSEHOLD_RULE_PRIORITY = 10_000;

const planIdSchema = z.object({
  planId: z.string().uuid(),
});

/** Minimal meal payload for draft slot update (matches Meal shape) */
const mealIngredientRefSchema = z.object({
  nevoCode: z.string(),
  quantityG: z.number().min(1),
  displayName: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const draftSlotMealSchema = z.object({
  id: z.string(),
  name: z.string(),
  slot: mealSlotSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ingredientRefs: z.array(mealIngredientRefSchema).min(1),
  ingredients: z
    .array(
      z.object({
        name: z.string(),
        amount: z.number().min(0),
        unit: z.string(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  estimatedMacros: z
    .object({
      calories: z.number().min(0).optional(),
      protein: z.number().min(0).optional(),
      carbs: z.number().min(0).optional(),
      fat: z.number().min(0).optional(),
      saturatedFat: z.number().min(0).optional(),
    })
    .optional(),
  nutrition: z
    .object({
      calories: z.number().min(0).optional(),
      protein: z.number().min(0).optional(),
      carbs: z.number().min(0).optional(),
      fat: z.number().min(0).optional(),
      saturatedFat: z.number().min(0).optional(),
    })
    .optional(),
  prepTime: z.number().min(0).optional(),
  servings: z.number().min(1).optional(),
});

const updateMealPlanDraftSlotInputSchema = z.object({
  planId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealSlot: mealSlotSchema,
  meal: draftSlotMealSchema,
});

/**
 * Replace a single meal slot in draft (immutable). Returns new draft.
 * day.date === date, meal.slot === mealSlot → replace that meal.
 */
function replaceSlotInDraft(
  draft: MealPlanResponse,
  date: string,
  mealSlot: MealSlot,
  newMeal: Meal,
): MealPlanResponse {
  const dayIndex = draft.days.findIndex((d) => d.date === date);
  if (dayIndex < 0) return draft;

  const day = draft.days[dayIndex];
  const mealIndex = day.meals.findIndex((m) => m.slot === mealSlot);
  if (mealIndex < 0) return draft;

  const normalizedMeal: Meal = {
    ...newMeal,
    date,
    slot: mealSlot,
  };

  const newMeals = [...day.meals];
  newMeals[mealIndex] = normalizedMeal;

  const newDay: MealPlanDay = {
    ...day,
    meals: newMeals,
  };

  const newDays = [...draft.days];
  newDays[dayIndex] = newDay;

  return {
    ...draft,
    days: newDays,
  };
}

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
          | 'NOT_FOUND'
          | 'MEAL_PLAN_INVALID_STATE'
          | 'MEAL_PLAN_REVIEW_START_FAILED'
          | 'MEAL_PLAN_APPLY_FAILED'
          | 'MEAL_PLAN_DRAFT_SLOT_UPDATE_FAILED'
          | 'GUARDRAILS_VIOLATION';
        message: string;
        details?: {
          outcome: 'blocked';
          reasonCodes: string[];
          contentHash?: string;
          rulesetVersion?: number;
          householdRuleApplied?: boolean;
        };
      };
    };

/**
 * Start meal plan review: set plan to draft and copy plan_snapshot into draft_plan_snapshot.
 * Idempotent: if already draft with draft_plan_snapshot set, returns success without update.
 */
export async function startMealPlanReviewAction(
  raw: unknown,
): Promise<ActionResult<{ status: 'draft' }>> {
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
          message: 'Je moet ingelogd zijn om een meal plan te reviewen',
        },
      };
    }

    let input: { planId: string };
    try {
      input = planIdSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Ongeldige planId',
        },
      };
    }

    const { data: plan, error: fetchError } = await supabase
      .from('meal_plans')
      .select(MEAL_PLAN_REVIEW_COLUMNS)
      .eq('id', input.planId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !plan) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Meal plan niet gevonden',
        },
      };
    }

    const status = (plan as { status?: string }).status;
    const draftSnapshot = (plan as { draft_plan_snapshot?: unknown })
      .draft_plan_snapshot;
    const planSnapshot = (plan as { plan_snapshot?: unknown }).plan_snapshot;

    if (status === 'draft' && draftSnapshot != null) {
      return { ok: true, data: { status: 'draft' } };
    }

    if (planSnapshot == null) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message:
            'Plan heeft geen plan_snapshot en kan niet in review worden gezet',
        },
      };
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('meal_plans')
      .update({
        status: 'draft',
        draft_plan_snapshot: planSnapshot,
        draft_created_at: now,
        updated_at: now,
      })
      .eq('id', input.planId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_REVIEW_START_FAILED',
          message: `Review starten mislukt: ${updateError.message}`,
        },
      };
    }

    return { ok: true, data: { status: 'draft' } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'MEAL_PLAN_REVIEW_START_FAILED',
        message:
          error instanceof Error ? error.message : 'Fout bij starten review',
      },
    };
  }
}

/**
 * Apply meal plan draft: copy draft_plan_snapshot to plan_snapshot and clear draft.
 * Preconditions: status === 'draft' and draft_plan_snapshot is not null.
 */
export async function applyMealPlanDraftAction(raw: unknown): Promise<
  ActionResult<{
    status: 'applied';
    warning?: {
      warned: true;
      householdRuleApplied: boolean;
      reasonCodes?: string[];
    };
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
          message: 'Je moet ingelogd zijn om een draft toe te passen',
        },
      };
    }

    let input: { planId: string };
    try {
      input = planIdSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Ongeldige planId',
        },
      };
    }

    const { data: plan, error: fetchError } = await supabase
      .from('meal_plans')
      .select(MEAL_PLAN_APPLY_COLUMNS)
      .eq('id', input.planId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !plan) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Meal plan niet gevonden',
        },
      };
    }

    const status = (plan as { status?: string }).status;
    const draftSnapshot = (plan as { draft_plan_snapshot?: unknown })
      .draft_plan_snapshot;

    if (status !== 'draft') {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message: 'Alleen een plan in draft-status kan worden toegepast',
        },
      };
    }

    if (draftSnapshot == null) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message: 'Plan heeft geen draft om toe te passen',
        },
      };
    }

    const dietKey = (plan as { diet_key?: string }).diet_key;
    if (!dietKey || typeof dietKey !== 'string') {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message: 'Plan heeft geen dieet om guardrails te laden',
        },
      };
    }

    const draftAsPlan = draftSnapshot as Record<string, unknown>;
    if (
      typeof draftAsPlan !== 'object' ||
      draftAsPlan === null ||
      !Array.isArray(draftAsPlan.days)
    ) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message: 'Draft heeft geen geldige plan-structuur',
        },
      };
    }

    let householdRules: GuardRule[] = [];
    let hadWarnedOutcome = false;
    let hadHouseholdRules = false;
    let decisionReasonCodes: string[] | undefined;
    try {
      const ruleset = await loadGuardrailsRuleset({
        dietId: dietKey,
        mode: 'plan_chat',
        locale: 'nl',
      });

      const { data: prefs } = await supabase
        .from('user_preferences')
        .select(USER_PREFS_HOUSEHOLD_COLUMN)
        .eq('user_id', user.id)
        .single();

      const householdId =
        prefs != null &&
        typeof (prefs as { household_id?: string | null }).household_id ===
          'string'
          ? (prefs as { household_id: string }).household_id
          : null;

      if (householdId) {
        const { data: avoidRows } = await supabase
          .from('household_avoid_rules')
          .select(HOUSEHOLD_AVOID_RULES_APPLY_COLUMNS)
          .eq('household_id', householdId);

        if (Array.isArray(avoidRows) && avoidRows.length > 0) {
          type AvoidRow = {
            match_mode?: string;
            match_value?: string;
            strictness?: string;
            rule_type?: string;
          };
          householdRules = (avoidRows as AvoidRow[]).map((row, i) => {
            const matchMode = String(row.match_mode ?? '').trim();
            const matchValue = String(row.match_value ?? '').trim();
            const id = `household-avoid-${householdId}-${i}`;
            const ruleType = String(row.rule_type ?? '').trim();
            const dbStrictness = String(row.strictness ?? 'hard').trim();
            const effectiveStrictness: 'hard' | 'soft' =
              ruleType === 'warning'
                ? 'soft'
                : dbStrictness === 'soft'
                  ? 'soft'
                  : 'hard';
            if (matchMode === 'nevo_code') {
              return {
                id,
                action: 'block' as const,
                strictness: effectiveStrictness,
                priority: HOUSEHOLD_RULE_PRIORITY,
                target: 'ingredient' as const,
                match: {
                  term: matchValue,
                  canonicalId: matchValue,
                  preferredMatchMode: 'canonical_id' as const,
                },
                metadata: {
                  ruleCode: 'FORBIDDEN_INGREDIENT',
                  label: 'Household avoid rule',
                  specificity: 'user' as const,
                },
              } satisfies GuardRule;
            }
            const termLower = matchValue.toLowerCase();
            return {
              id,
              action: 'block' as const,
              strictness: effectiveStrictness,
              priority: HOUSEHOLD_RULE_PRIORITY,
              target: 'ingredient' as const,
              match: {
                term: termLower,
                preferredMatchMode: 'substring' as const,
              },
              metadata: {
                ruleCode: 'FORBIDDEN_INGREDIENT',
                label: 'Household avoid rule',
                specificity: 'user' as const,
              },
            } satisfies GuardRule;
          });
        }
      }

      const rulesetWithHousehold = {
        ...ruleset,
        rules: [...ruleset.rules, ...householdRules],
      };

      const targets = mapMealPlanToGuardrailsTargets(
        draftSnapshot as MealPlanResponse,
        'nl',
      );

      const overrides = await loadMagicianOverrides();
      const context: EvaluationContext = {
        dietKey,
        locale: 'nl',
        mode: 'plan_chat',
        timestamp: new Date().toISOString(),
        excludeOverrides: overrides,
      };

      const decision = evaluateGuardrails({
        ruleset: rulesetWithHousehold,
        context,
        targets,
      });

      if (!decision.ok || decision.outcome === 'blocked') {
        return {
          ok: false,
          error: {
            code: 'GUARDRAILS_VIOLATION',
            message:
              decision.summary || 'Dit menu voldoet niet aan de dieetregels',
            details: {
              outcome: 'blocked',
              reasonCodes: decision.reasonCodes,
              contentHash: ruleset.contentHash,
              rulesetVersion: ruleset.version,
              ...(householdRules.length > 0 && { householdRuleApplied: true }),
            },
          },
        };
      }

      hadWarnedOutcome = decision.outcome === 'warned';
      hadHouseholdRules = householdRules.length > 0;
      decisionReasonCodes = decision.reasonCodes;
    } catch (guardrailsError) {
      console.error(
        '[applyMealPlanDraft] Guardrails evaluation error:',
        guardrailsError instanceof Error
          ? guardrailsError.message
          : String(guardrailsError),
      );
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Fout bij laden of evalueren dieetregels',
        },
      };
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('meal_plans')
      .update({
        plan_snapshot: draftSnapshot,
        draft_plan_snapshot: null,
        draft_created_at: null,
        status: 'applied',
        applied_at: now,
        updated_at: now,
      })
      .eq('id', input.planId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_APPLY_FAILED',
          message: `Draft toepassen mislukt: ${updateError.message}`,
        },
      };
    }

    return {
      ok: true,
      data: {
        status: 'applied',
        ...(hadWarnedOutcome &&
          hadHouseholdRules && {
            warning: {
              warned: true as const,
              householdRuleApplied: true,
              ...(decisionReasonCodes &&
                decisionReasonCodes.length > 0 && {
                  reasonCodes: decisionReasonCodes,
                }),
            },
          }),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'MEAL_PLAN_APPLY_FAILED',
        message:
          error instanceof Error ? error.message : 'Fout bij toepassen draft',
      },
    };
  }
}

/**
 * Cancel meal plan review: set status to 'applied', clear draft_plan_snapshot and draft_created_at.
 * plan_snapshot remains unchanged. Only allowed when status === 'draft'.
 */
export async function cancelMealPlanReviewAction(
  raw: unknown,
): Promise<ActionResult<{ status: 'applied' }>> {
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
          message: 'Je moet ingelogd zijn om een review te annuleren',
        },
      };
    }

    let input: { planId: string };
    try {
      input = planIdSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Ongeldige planId',
        },
      };
    }

    const { data: plan, error: fetchError } = await supabase
      .from('meal_plans')
      .select(MEAL_PLAN_CANCEL_COLUMNS)
      .eq('id', input.planId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Meal plan ophalen mislukt: ${fetchError.message}`,
        },
      };
    }

    if (!plan) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Meal plan niet gevonden',
        },
      };
    }

    const status = (plan as { status?: string }).status;
    if (status !== 'draft') {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message: 'Alleen een plan in draft-status kan worden geannuleerd',
        },
      };
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('meal_plans')
      .update({
        status: 'applied',
        draft_plan_snapshot: null,
        draft_created_at: null,
        updated_at: now,
      })
      .eq('id', input.planId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: `Review annuleren mislukt: ${updateError.message}`,
        },
      };
    }

    return { ok: true, data: { status: 'applied' } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'DB_ERROR',
        message:
          error instanceof Error ? error.message : 'Fout bij annuleren review',
      },
    };
  }
}

/**
 * Update a single meal slot in the draft (swap). Guardrails evaluated on new draft; fail-closed.
 * Only draft_plan_snapshot and updated_at are persisted; plan_snapshot unchanged.
 */
export async function updateMealPlanDraftSlotAction(
  raw: unknown,
): Promise<ActionResult<{ status: 'draft' }>> {
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
          message: 'Je moet ingelogd zijn om een draft-slot te wijzigen',
        },
      };
    }

    let input: z.infer<typeof updateMealPlanDraftSlotInputSchema>;
    try {
      input = updateMealPlanDraftSlotInputSchema.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Ongeldige input voor draft-slot update',
        },
      };
    }

    const { data: plan, error: fetchError } = await supabase
      .from('meal_plans')
      .select(MEAL_PLAN_APPLY_COLUMNS)
      .eq('id', input.planId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !plan) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Meal plan niet gevonden',
        },
      };
    }

    const status = (plan as { status?: string }).status;
    const draftSnapshot = (plan as { draft_plan_snapshot?: unknown })
      .draft_plan_snapshot;
    const dietKey = (plan as { diet_key?: string }).diet_key;

    if (status !== 'draft') {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message:
            'Alleen een plan in draft-status kan per-slot worden gewijzigd',
        },
      };
    }

    if (draftSnapshot == null) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message: 'Plan heeft geen draft om te wijzigen',
        },
      };
    }

    if (!dietKey || typeof dietKey !== 'string') {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message: 'Plan heeft geen dieet om guardrails te laden',
        },
      };
    }

    const draftAsPlan = draftSnapshot as Record<string, unknown>;
    if (
      typeof draftAsPlan !== 'object' ||
      draftAsPlan === null ||
      !Array.isArray(draftAsPlan.days)
    ) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message: 'Draft heeft geen geldige plan-structuur',
        },
      };
    }

    const draft = draftSnapshot as MealPlanResponse;
    const dayIndex = draft.days.findIndex((d) => d.date === input.date);
    if (dayIndex < 0) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message: `Geen dag gevonden voor datum ${input.date}`,
        },
      };
    }

    const day = draft.days[dayIndex];
    const mealIndex = day.meals.findIndex((m) => m.slot === input.mealSlot);
    if (mealIndex < 0) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_INVALID_STATE',
          message: `Geen maaltijd-slot '${input.mealSlot}' gevonden op ${input.date}`,
        },
      };
    }

    const newDraft = replaceSlotInDraft(
      draft,
      input.date,
      input.mealSlot as MealSlot,
      input.meal as Meal,
    );

    try {
      const ruleset = await loadGuardrailsRuleset({
        dietId: dietKey,
        mode: 'plan_chat',
        locale: 'nl',
      });

      const targets = mapMealPlanToGuardrailsTargets(newDraft, 'nl');
      const overrides = await loadMagicianOverrides();
      const context: EvaluationContext = {
        dietKey,
        locale: 'nl',
        mode: 'plan_chat',
        timestamp: new Date().toISOString(),
        excludeOverrides: overrides,
      };

      const decision = evaluateGuardrails({
        ruleset,
        context,
        targets,
      });

      if (!decision.ok || decision.outcome === 'blocked') {
        return {
          ok: false,
          error: {
            code: 'GUARDRAILS_VIOLATION',
            message:
              decision.summary ||
              'Deze wijziging voldoet niet aan de dieetregels',
            details: {
              outcome: 'blocked',
              reasonCodes: decision.reasonCodes,
              contentHash: ruleset.contentHash,
              rulesetVersion: ruleset.version,
            },
          },
        };
      }
    } catch (guardrailsError) {
      console.error(
        '[updateMealPlanDraftSlot] Guardrails evaluation error:',
        guardrailsError instanceof Error
          ? guardrailsError.message
          : String(guardrailsError),
      );
      return {
        ok: false,
        error: {
          code: 'DB_ERROR',
          message: 'Fout bij laden of evalueren dieetregels',
        },
      };
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('meal_plans')
      .update({
        draft_plan_snapshot: newDraft,
        updated_at: now,
      })
      .eq('id', input.planId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        ok: false,
        error: {
          code: 'MEAL_PLAN_DRAFT_SLOT_UPDATE_FAILED',
          message: `Draft-slot update mislukt: ${updateError.message}`,
        },
      };
    }

    return { ok: true, data: { status: 'draft' } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'MEAL_PLAN_DRAFT_SLOT_UPDATE_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Fout bij wijzigen draft-slot',
      },
    };
  }
}
