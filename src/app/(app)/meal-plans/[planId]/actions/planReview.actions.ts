'use server';

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
          | 'GUARDRAILS_VIOLATION'
          | 'FEATURE_DISABLED';
        message: string;
        details?: Record<string, unknown>;
      };
    };

const FEATURE_DISABLED_RESULT = {
  ok: false as const,
  error: {
    code: 'FEATURE_DISABLED' as const,
    message:
      'Plan review en draft-aanpassingen zijn tijdelijk uitgeschakeld. Deze functie komt binnenkort weer beschikbaar.',
  },
};

/**
 * Start meal plan review — FEATURE_DISABLED (meal planner removed)
 */
export async function startMealPlanReviewAction(
  _raw: unknown,
): Promise<ActionResult<{ status: 'draft' }>> {
  return FEATURE_DISABLED_RESULT;
}

/**
 * Apply meal plan draft — FEATURE_DISABLED (meal planner removed)
 */
export async function applyMealPlanDraftAction(_raw: unknown): Promise<
  ActionResult<{
    status: 'applied';
    warning?: {
      warned: true;
      householdRuleApplied: boolean;
      reasonCodes?: string[];
    };
  }>
> {
  return FEATURE_DISABLED_RESULT;
}

/**
 * Cancel meal plan review — FEATURE_DISABLED (meal planner removed)
 */
export async function cancelMealPlanReviewAction(
  _raw: unknown,
): Promise<ActionResult<{ status: 'applied' }>> {
  return FEATURE_DISABLED_RESULT;
}

/**
 * Update draft slot — FEATURE_DISABLED (meal planner removed)
 */
export async function updateMealPlanDraftSlotAction(
  _raw: unknown,
): Promise<ActionResult<{ status: 'draft' }>> {
  return FEATURE_DISABLED_RESULT;
}
