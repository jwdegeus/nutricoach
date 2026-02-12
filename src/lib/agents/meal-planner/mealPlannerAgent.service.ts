/**
 * Meal Planner Agent Service
 *
 * End-to-end service for generating meal plans using Gemini AI
 * with structured output and Zod validation.
 */

import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
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
  type MealSlot,
} from '@/src/lib/diets';
import {
  buildMealPlanPrompt,
  buildMealPlanDayPrompt,
  buildMealPrompt,
} from './mealPlannerAgent.prompts';
import { buildRepairPrompt } from './mealPlannerAgent.repair';
import {
  validateHardConstraints,
  validateAndAdjustDayMacros,
  validateDayHardConstraints,
  getExpandedAllergenTermsForExclusion,
} from './mealPlannerAgent.validate';
import {
  buildCandidatePool,
  type CandidatePool,
} from './mealPlannerAgent.tools';
import { getMealPlanResponseJsonSchemaForGemini } from './mealPlannerAgent.gemini-schema';
import { zodToJsonSchema } from 'zod-to-json-schema';
// vNext guard rails (shadow mode + enforcement) + Diet Logic (Dieetregels)
import { compileConstraintsForAI } from '@/src/lib/guardrails-vnext';
import { loadGuardrailsRuleset } from '@/src/lib/guardrails-vnext/ruleset-loader';
import { AppError } from '@/src/lib/errors/app-error';
import { enforceMealPlannerGuardrails } from './enforceMealPlannerGuardrails';
import { getMealPlannerConfig } from '@/src/lib/meal-plans/mealPlans.config';
import { getShakeSmoothieGuidance } from '@/src/lib/messages.server';
import type { GeneratorMeta } from '@/src/lib/diets/diet.types';
import { sanitizeCandidatePool } from '@/src/lib/meal-plans/candidatePoolSanitizer';
import {
  validateMealPlanSanity,
  type SanityResult,
} from '@/src/lib/meal-plans/mealPlanSanityValidator';
import { validateCulinaryCoherence } from './validators/culinaryCoherenceValidator';
import { getCanonicalIngredientIdsByNevoCodes } from './mealPlannerShopping.service';
import { createClient } from '@/src/lib/supabase/server';
import {
  loadMealPlanGeneratorConfig,
  mergePoolItemsWithCandidatePool,
  filterTemplatePoolsByExcludeTerms,
} from '@/src/lib/meal-plans/mealPlanGeneratorConfigLoader';
import {
  generateTemplatePlan,
  InsufficientAllowedIngredientsError,
} from '@/src/lib/meal-plans/templateFallbackGenerator';
import { loadHardBlockTermsForDiet } from '@/src/lib/meal-plans/guardrailsExcludeTerms';
import { estimateTherapeuticCoverage } from '@/src/lib/therapeutic/therapeuticCoverageEstimator';

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

/** Max output tokens for full meal plan JSON (avoids truncation → "Unterminated string"). */
const MEAL_PLAN_JSON_MAX_TOKENS =
  typeof process !== 'undefined' &&
  process.env.GEMINI_MAX_OUTPUT_TOKENS_PLAN != null
    ? parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS_PLAN, 10)
    : 8192;

/**
 * Normalize raw JSON from the model: trim and strip markdown code block if present.
 * Reduces parse failures from wrapped or stray whitespace.
 */
function normalizeJsonFromModel(raw: string): string {
  let s = raw.trim();
  const codeBlockMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (codeBlockMatch) {
    s = codeBlockMatch[1].trim();
  }
  return s;
}

/** True when user has shake/smoothie preference for any slot (used to always remind in repair prompts). */
function hasShakeSmoothiePreferenceInRequest(
  request: MealPlanRequest,
): boolean {
  const mealPrefs = request.profile.mealPreferences;
  const all = [
    ...(mealPrefs?.breakfast ?? []),
    ...(mealPrefs?.lunch ?? []),
    ...(mealPrefs?.dinner ?? []),
  ];
  const lower = all.join(' ').toLowerCase();
  return (
    lower.includes('shake') ||
    lower.includes('smoothie') ||
    lower.includes('eiwit shake')
  );
}

/**
 * Vul per ingredientRef canonicalIngredientId in (write-time); geen extra writes.
 * Lookup fout → log, canonical blijft leeg; mealplan blijft geldig.
 */
async function enrichPlanWithCanonicalIngredientIds(
  plan: MealPlanResponse,
): Promise<void> {
  const nevoCodes = new Set<string>();
  for (const day of plan.days) {
    for (const meal of day.meals) {
      for (const ref of meal.ingredientRefs ?? []) {
        if (ref.nevoCode?.trim()) nevoCodes.add(ref.nevoCode.trim());
      }
    }
  }
  if (nevoCodes.size === 0) return;
  try {
    const nevoToCanonicalId = await getCanonicalIngredientIdsByNevoCodes(
      Array.from(nevoCodes),
    );
    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const ref of meal.ingredientRefs ?? []) {
          const id = ref.nevoCode?.trim()
            ? nevoToCanonicalId.get(ref.nevoCode.trim())
            : undefined;
          if (id) ref.canonicalIngredientId = id;
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Canonical ingredient enrichment (plan) failed:', msg);
  }
}

/**
 * Vul per ingredientRef in day.canonicalIngredientId in (write-time).
 */
async function enrichDayWithCanonicalIngredientIds(
  day: MealPlanDay,
): Promise<void> {
  const nevoCodes = new Set<string>();
  for (const meal of day.meals) {
    for (const ref of meal.ingredientRefs ?? []) {
      if (ref.nevoCode?.trim()) nevoCodes.add(ref.nevoCode.trim());
    }
  }
  if (nevoCodes.size === 0) return;
  try {
    const nevoToCanonicalId = await getCanonicalIngredientIdsByNevoCodes(
      Array.from(nevoCodes),
    );
    for (const meal of day.meals) {
      for (const ref of meal.ingredientRefs ?? []) {
        const id = ref.nevoCode?.trim()
          ? nevoToCanonicalId.get(ref.nevoCode.trim())
          : undefined;
        if (id) ref.canonicalIngredientId = id;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Canonical ingredient enrichment (day) failed:', msg);
  }
}

/** Provenance counters for plan_snapshot (debugging/UX) */
export type PlanProvenance = {
  reusedRecipeCount: number;
  generatedRecipeCount: number;
};

/** Options for generateMealPlan: optional prefilled meals, AI slot cap, culinary rules, DB coverage (from DB config) */
export type GenerateMealPlanOptions = {
  /** Meals by slot (breakfast/lunch/dinner) to prefer; ~80% of slots will be filled from these when possible */
  prefilledBySlot?: Partial<Record<MealSlot, Meal[]>>;
  /** Max AI-invented slots for this plan (from DB config). When set, prompt instructs cap and post-check enforces it. */
  maxAiSlotsForPlan?: number;
  /** Culinary coherence rules (from loadMealPlanGeneratorDbConfig). When set, Gemini path validates plan against them. */
  culinaryRules?: import('@/src/lib/meal-planner/config/mealPlanGeneratorDbConfig').MealPlanCulinaryRuleV1[];
  /** Min ratio of slots that must be DB-backed (history/custom/recipe). When set, Gemini path enforces after provenance is attached. */
  minDbRecipeCoverageRatio?: number;
  /** Variety targets for prompt (retry only); when set, adds VARIETY HARD REQUIREMENTS to Gemini prompt. Same caps apply. */
  varietyTargetsForPrompt?: {
    unique_veg_min: number;
    unique_fruit_min: number;
    protein_rotation_min_categories: number;
    max_repeat_same_recipe_within_days: number;
  };
  /** When true, accept plan even if DB recipe ratio is below minDbRecipeCoverageRatio (set metadata.dbCoverageBelowTarget instead of throwing). */
  allowDbCoverageFallback?: boolean;
  /** When true, skip template generator and use Gemini only (for DB-first flow: fill only missing slots). */
  dbFirstFillMissing?: boolean;
  /** When set with dbFirstFillMissing, only these slots need to be filled by AI; service merges result into skeleton. Agent still returns full plan. */
  onlySlots?: Array<{ date: string; slot: MealSlot }>;
};

/**
 * Pick which (dayIndex, slotIndex) pairs to fill from existing recipes.
 * Random sample within total slots; de-dupe per day (same meal id not twice on same day) is enforced when applying.
 */
function pickExistingRecipesForPlan(args: {
  slots: MealSlot[];
  numDays: number;
  targetCount: number;
}): { dayIndex: number; slotIndex: number }[] {
  const { slots, numDays, targetCount } = args;
  const total = numDays * slots.length;
  if (total === 0 || targetCount <= 0) return [];

  const indices: { dayIndex: number; slotIndex: number }[] = [];
  for (let d = 0; d < numDays; d++) {
    for (let s = 0; s < slots.length; s++) {
      indices.push({ dayIndex: d, slotIndex: s });
    }
  }
  // Fisher–Yates shuffle first `targetCount` into a sample
  const count = Math.min(targetCount, indices.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count);
}

/** Deep-clone plan for candidate validation (no extra DB; in-memory only). */
function clonePlan(plan: MealPlanResponse): MealPlanResponse {
  return JSON.parse(JSON.stringify(plan)) as MealPlanResponse;
}

type SlotProvenanceEntry = {
  source: 'db' | 'ai' | 'history';
  reason?: string;
};

/**
 * Apply prefilled meals into plan for selected slots.
 * - De-dupe per day (same meal id not twice on same day).
 * - Avoid same meal on consecutive days (no identical breakfast/dinner two days in a row).
 * - MVP: each replacement is validated; only applied if the plan still passes hard constraints.
 * - When slotProvenanceOut is provided, fills it: replaced slots → 'db', untouched remain 'ai'.
 * Returns number of meals from recipe DB (custom_meals) replaced. Meals from meal_history don't count as "database".
 */
async function applyPrefilledMeals(
  plan: MealPlanResponse,
  request: MealPlanRequest,
  prefilledBySlot: Partial<Record<MealSlot, Meal[]>>,
  slotIndices: { dayIndex: number; slotIndex: number }[],
  rules: ReturnType<typeof deriveDietRuleSet>,
  slotProvenanceOut?: Record<string, SlotProvenanceEntry>,
): Promise<number> {
  const slots = request.slots;
  const startDate = new Date(request.dateRange.start);
  const usedPerDay = new Map<number, Set<string>>();
  /** Base meal ids placed per (day, slot) so we can avoid same meal on consecutive days */
  const baseIdByDayAndSlot = new Map<string, string>();
  let replaced = 0;

  const sortedIndices = [...slotIndices].sort(
    (a, b) => a.dayIndex - b.dayIndex || a.slotIndex - b.slotIndex,
  );

  for (const { dayIndex, slotIndex } of sortedIndices) {
    if (dayIndex >= plan.days.length) continue;
    const day = plan.days[dayIndex];
    const slot = slots[slotIndex];
    if (!slot || !day.meals[slotIndex]) continue;

    const pool = prefilledBySlot[slot];
    if (!pool || pool.length === 0) continue;

    if (!usedPerDay.has(dayIndex)) {
      const used = new Set<string>();
      for (const m of day.meals) {
        used.add(m.id);
      }
      usedPerDay.set(dayIndex, used);
    }
    const usedOnDay = usedPerDay.get(dayIndex)!;
    const usedPrevDaySameSlot =
      dayIndex > 0
        ? baseIdByDayAndSlot.get(`${dayIndex - 1}-${slot}`)
        : undefined;

    const candidate = pool.find(
      (m) =>
        !usedOnDay.has(m.id) &&
        (usedPrevDaySameSlot === undefined || m.id !== usedPrevDaySameSlot),
    );
    if (!candidate) continue;

    const dateStr = (() => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + dayIndex);
      return d.toISOString().split('T')[0];
    })();

    const replacedMeal: Meal = {
      ...candidate,
      date: dateStr,
      id: `${candidate.id}-${dateStr}-${slot}`,
    };

    // MVP: only apply if plan with this replacement still passes hard constraints
    const candidatePlan = clonePlan(plan);
    candidatePlan.days[dayIndex].meals[slotIndex] = replacedMeal;
    const issues = await validateHardConstraints({
      plan: candidatePlan,
      rules,
      request,
    });
    if (issues.length > 0) continue;

    day.meals[slotIndex] = replacedMeal;
    usedOnDay.add(candidate.id);
    baseIdByDayAndSlot.set(`${dayIndex}-${slot}`, candidate.id);
    if (slotProvenanceOut) {
      // Only custom_meals count as "database"; meal_history = reused past meals, often AI-generated
      const fromRecipeDb = candidate.recipeSource === 'custom_meals';
      slotProvenanceOut[`${dateStr}-${slot}`] = {
        source: fromRecipeDb ? 'db' : 'history',
      };
    }
    if (candidate.recipeSource === 'custom_meals') replaced++;
  }

  return replaced;
}

/**
 * Apply prefilled meals (if options provided) and attach provenance to plan.metadata.
 * Mutates plan in place; call before returning from generateMealPlan.
 * Prefilled replacements are only applied when the resulting plan still passes hard constraints.
 */
async function applyPrefilledAndAttachProvenance(
  plan: MealPlanResponse,
  request: MealPlanRequest,
  options: GenerateMealPlanOptions | undefined,
  rules: ReturnType<typeof deriveDietRuleSet>,
): Promise<void> {
  const totalMeals = plan.days.reduce((s, d) => s + d.meals.length, 0);
  let reusedRecipeCount: number;
  let generatedRecipeCount: number;

  const slotProvenance: Record<string, SlotProvenanceEntry> = {};
  for (const day of plan.days) {
    for (const meal of day.meals) {
      const key = `${day.date}-${meal.slot}`;
      slotProvenance[key] = { source: 'ai' };
    }
  }

  if (
    options?.prefilledBySlot &&
    Object.keys(options.prefilledBySlot).length > 0
  ) {
    const targetCount = Math.round(
      totalMeals * getMealPlannerConfig().targetReuseRatio,
    );
    const slotIndices = pickExistingRecipesForPlan({
      slots: request.slots,
      numDays: plan.days.length,
      targetCount,
    });
    const replaced = await applyPrefilledMeals(
      plan,
      request,
      options.prefilledBySlot,
      slotIndices,
      rules,
      slotProvenance,
    );
    reusedRecipeCount = replaced;
    generatedRecipeCount = totalMeals - replaced;
  } else {
    reusedRecipeCount = 0;
    generatedRecipeCount = totalMeals;
  }

  const provenance: PlanProvenance = {
    reusedRecipeCount,
    generatedRecipeCount,
  };
  const dbSlots = Object.values(slotProvenance).filter(
    (e) => e.source === 'db',
  ).length;
  const dbCoverage =
    totalMeals > 0
      ? {
          dbSlots,
          totalSlots: totalMeals,
          percent: Math.round((dbSlots / totalMeals) * 100),
        }
      : undefined;

  const meta = plan.metadata ?? {
    generatedAt: new Date().toISOString(),
    dietKey: request.profile.dietKey,
    totalDays: plan.days.length,
    totalMeals,
  };
  plan.metadata = {
    ...meta,
    provenance,
    slotProvenance,
    ...(dbCoverage && { dbCoverage }),
  } as MealPlanResponse['metadata'];
}

/**
 * Throws MEAL_PLAN_AI_BUDGET_EXCEEDED when plan has more AI-generated slots than allowed.
 * Call after applyPrefilledAndAttachProvenance when maxAiSlotsForPlan is set.
 */
function throwIfAiBudgetExceeded(
  plan: MealPlanResponse,
  maxAiSlotsForPlan: number | undefined,
): void {
  if (maxAiSlotsForPlan === undefined) return;
  const generated =
    (
      plan.metadata as
        | { provenance?: { generatedRecipeCount?: number } }
        | undefined
    )?.provenance?.generatedRecipeCount ?? 0;
  if (generated <= maxAiSlotsForPlan) return;
  throw new AppError(
    'MEAL_PLAN_AI_BUDGET_EXCEEDED',
    'Het aantal AI-gegenereerde maaltijden overschrijdt het maximum. Voeg meer recepten toe of vraag de beheerder het maximum aan te passen.',
    { generated, maxAllowed: maxAiSlotsForPlan },
  );
}

/**
 * Throws MEAL_PLAN_DB_COVERAGE_TOO_LOW when DB-backed slot ratio is below required minimum.
 * When allowFallback is true, accepts the plan and sets metadata.dbCoverageBelowTarget instead (AI fills the gap).
 * Uses plan.metadata.provenance (reusedRecipeCount = DB, generatedRecipeCount = AI). Call after applyPrefilledAndAttachProvenance.
 */
function throwIfDbCoverageTooLow(
  plan: MealPlanResponse,
  minDbRecipeCoverageRatio: number | undefined,
  allowFallback?: boolean,
): void {
  if (minDbRecipeCoverageRatio === undefined || minDbRecipeCoverageRatio <= 0)
    return;
  const totalSlots =
    plan.metadata?.totalMeals ??
    plan.days.reduce((s, d) => s + (d.meals?.length ?? 0), 0);
  if (totalSlots === 0) return;
  const dbSlots =
    (
      plan.metadata as
        | { provenance?: { reusedRecipeCount?: number } }
        | undefined
    )?.provenance?.reusedRecipeCount ?? 0;
  const requiredDbSlots = Math.ceil(totalSlots * minDbRecipeCoverageRatio);
  const actualRatio = dbSlots / totalSlots;
  if (dbSlots >= requiredDbSlots) return;
  if (allowFallback) {
    const meta = (plan.metadata ?? {}) as Record<string, unknown>;
    meta.dbCoverageBelowTarget = true;
    plan.metadata = meta as MealPlanResponse['metadata'];
    return;
  }
  throw new AppError(
    'MEAL_PLAN_DB_COVERAGE_TOO_LOW',
    'Het menu bevat te weinig recepten uit je eigen database. Voeg meer recepten toe of verlaag de vereiste verhouding in de beheerinstellingen.',
    {
      dbSlots,
      totalSlots,
      requiredRatio: minDbRecipeCoverageRatio,
      actualRatio: Math.round(actualRatio * 1000) / 1000,
    },
  );
}

/**
 * Get or build candidate pool (with caching)
 */
async function getCandidatePool(
  dietKey: string,
  excludeTerms: string[],
): Promise<CandidatePool> {
  const cacheKey = `${dietKey}:${excludeTerms.sort().join(',')}`;
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

/** Result of getConstraintsText: prompt text + optional ruleset meta for run logging (no PII). */
export type GuardrailsConstraintsResult = {
  promptText?: string;
  contentHash?: string | null;
  version?: number | null;
};

/**
 * Best-effort: load guardrails ruleset and compile constraint text for prompts.
 * Returns promptText + contentHash/version for observability; no throw.
 */
async function getConstraintsText(args: {
  dietId: string;
  locale: 'nl' | 'en';
  mode: 'meal_planner';
}): Promise<GuardrailsConstraintsResult> {
  try {
    const ruleset = await loadGuardrailsRuleset({
      dietId: args.dietId,
      mode: args.mode,
      locale: args.locale,
    });
    const { promptText } = await compileConstraintsForAI(ruleset, {
      locale: args.locale,
      mode: args.mode,
      timestamp: new Date().toISOString(),
    });
    return {
      promptText,
      contentHash: ruleset.contentHash ?? null,
      version: ruleset.version ?? null,
    };
  } catch {
    return {};
  }
}

/** Attach guardrails meta to plan.metadata for run logging (no constraints text, no PII). */
function attachGuardrailsMeta(
  plan: MealPlanResponse,
  constraintsInPrompt: boolean,
  contentHash: string | null,
  version: string | null,
): void {
  const meta = (plan.metadata ?? {}) as Record<string, unknown>;
  meta.guardrails = {
    constraintsInPrompt,
    contentHash,
    version,
  };
  plan.metadata = meta as MealPlanResponse['metadata'];
}

/** Attach generator observability to plan.metadata (mode, attempts, retryReason, templateInfo, sanity). */
function attachGeneratorMeta(
  plan: MealPlanResponse,
  generator: GeneratorMeta,
): void {
  const meta = (plan.metadata ?? {}) as Record<string, unknown>;
  meta.generator = generator;
  plan.metadata = meta as MealPlanResponse['metadata'];
}

/** Attach therapeutic targets snapshot + coverage to plan.metadata when request has therapeuticTargets (template + Gemini). */
function attachTherapeuticMetadata(
  plan: MealPlanResponse,
  request: MealPlanRequest,
): void {
  if (
    !request.therapeuticTargets ||
    typeof request.therapeuticTargets !== 'object'
  )
    return;
  const meta = { ...plan.metadata };
  (meta as Record<string, unknown>).therapeuticTargets =
    request.therapeuticTargets;
  const coverage = estimateTherapeuticCoverage(plan, request);
  if (coverage) {
    (meta as Record<string, unknown>).therapeuticCoverage = coverage;
  }
  plan.metadata = meta as MealPlanResponse['metadata'];
}

/** Throw AppError MEAL_PLAN_SANITY_FAILED when sanity check failed (safe NL message + details.issues). */
function throwIfSanityFailed(sanity: SanityResult): void {
  if (sanity.ok) return;
  throw new AppError(
    'MEAL_PLAN_SANITY_FAILED',
    'Het weekmenu voldoet niet aan de kwaliteitscontrole. Probeer opnieuw of pas je voorkeuren aan.',
    { issues: sanity.issues },
  );
}

/** Run shared guardrails enforcement; throws AppError GUARDRAILS_VIOLATION when blocked. */
async function runGuardrailsAndThrow(
  plan: MealPlanResponse,
  dietKey: string,
  locale: 'nl' | 'en',
  userId?: string,
): Promise<void> {
  const result = await enforceMealPlannerGuardrails(
    plan,
    dietKey,
    locale,
    userId,
  );
  if (!result.ok) {
    throw new AppError('GUARDRAILS_VIOLATION', result.message, result.details);
  }
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
   * Generate a meal plan from raw input.
   * When options.prefilledBySlot is provided, ~80% of slots are filled from existing meals; rest from AI.
   *
   * @param raw - Raw input (will be validated against MealPlanRequestSchema)
   * @param language - User language preference ('nl' or 'en'), defaults to 'nl'
   * @param options - Optional prefilled meals by slot (e.g. from meal_history) for ~80% reuse target
   * @returns Validated MealPlanResponse with provenance in metadata
   * @throws Error if validation fails or API call fails after repair attempt
   */
  async generateMealPlan(
    raw: unknown,
    language: 'nl' | 'en' = 'nl',
    options?: GenerateMealPlanOptions,
  ): Promise<MealPlanResponse> {
    // Step 1: Validate input request (includes optional therapeuticTargets from schema)
    let request: MealPlanRequest;
    try {
      request = mealPlanRequestSchema.parse(raw) as MealPlanRequest;
    } catch (error) {
      throw new Error(
        `Invalid meal plan request: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
      );
    }

    // Step 2: Derive rules from profile (security/consistency: onboarding is source of truth)
    // We never trust dietRuleSet from input - always derive from profile to ensure consistency
    const rules = deriveDietRuleSet(request.profile);

    // Step 3: Build candidate pool (with caching); expand allergies so pool excludes yoghurt/melk when Lactose, etc.
    const excludeTerms = [
      ...getExpandedAllergenTermsForExclusion(request.profile.allergies),
      ...request.profile.dislikes,
      ...(request.excludeIngredients || []),
    ];
    const rawCandidates = await getCandidatePool(
      request.profile.dietKey,
      excludeTerms,
    );

    // Step 4: Guardrails constraint text for prompt (once per generate call)
    const constraintsResult = await getConstraintsText({
      dietId: request.profile.dietKey,
      locale: language,
      mode: 'meal_planner',
    });
    const guardrailsConstraintsText = constraintsResult.promptText;
    const guardrailsMeta = {
      contentHash: constraintsResult.contentHash ?? null,
      version:
        constraintsResult.version != null
          ? String(constraintsResult.version)
          : null,
    };

    // Step 4b: Template-based generator (no free-form AI) when enabled (skip when DB-first is filling only missing slots)
    const useTemplateGenerator =
      !options?.dbFirstFillMissing &&
      process.env.USE_TEMPLATE_MEAL_GENERATOR === 'true';
    const enforceVNextGuardrails =
      process.env.ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER === 'true';

    if (useTemplateGenerator) {
      const supabase = await createClient();
      // Load generator config once (templates + slots, pool items, settings from DB; RLS, max 4 queries).
      const config = await loadMealPlanGeneratorConfig(
        supabase,
        request.profile.dietKey,
      );
      const guardrailsTerms = enforceVNextGuardrails
        ? await loadHardBlockTermsForDiet(
            supabase,
            request.profile.dietKey,
            language,
          )
        : [];
      const { pool: candidates, metrics: poolMetrics } = sanitizeCandidatePool(
        rawCandidates,
        excludeTerms,
        guardrailsTerms.length > 0
          ? { extraExcludeTerms: guardrailsTerms }
          : undefined,
      );
      const combinedExclude =
        guardrailsTerms.length > 0
          ? [...excludeTerms, ...guardrailsTerms]
          : excludeTerms;
      let templatePools;
      try {
        const merged = mergePoolItemsWithCandidatePool(
          config.poolItems,
          candidates,
        );
        templatePools = filterTemplatePoolsByExcludeTerms(
          merged,
          combinedExclude,
        );
      } catch (e) {
        if (e instanceof InsufficientAllowedIngredientsError) {
          throw new AppError('INSUFFICIENT_ALLOWED_INGREDIENTS', e.message, {
            retryReason: 'POOL_EMPTY',
          });
        }
        throw e;
      }
      let plan: MealPlanResponse;
      let templateInfo: { rotation: string[]; usedTemplateIds: string[] };
      let templateAttempts = 1;
      let templateRetryReason: GeneratorMeta['retryReason'] | undefined;
      try {
        const result = await generateTemplatePlan(
          request,
          config,
          templatePools,
        );
        plan = result.plan;
        templateInfo = result.templateInfo;
      } catch (e) {
        if (e instanceof InsufficientAllowedIngredientsError) {
          throw new AppError('INSUFFICIENT_ALLOWED_INGREDIENTS', e.message, {
            retryReason: 'POOL_EMPTY',
          });
        }
        throw e;
      }
      const enforceVNext =
        process.env.ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER === 'true';
      if (enforceVNext) {
        try {
          await runGuardrailsAndThrow(plan, request.profile.dietKey, language);
        } catch (guardError) {
          if (
            guardError instanceof AppError &&
            guardError.code === 'GUARDRAILS_VIOLATION'
          ) {
            try {
              const retryResult = await generateTemplatePlan(
                request,
                config,
                templatePools,
                1,
              );
              plan = retryResult.plan;
              templateInfo = retryResult.templateInfo;
              templateAttempts = 2;
              templateRetryReason = 'GUARDRAILS_VIOLATION';
              await runGuardrailsAndThrow(
                plan,
                request.profile.dietKey,
                language,
              );
            } catch (_retryError) {
              throw guardError;
            }
          } else {
            throw guardError;
          }
        }
      }
      // Culinary sanity check; max 1 retry with retrySeed 2
      let sanity = validateMealPlanSanity(plan);
      if (!sanity.ok) {
        try {
          const sanityRetryResult = await generateTemplatePlan(
            request,
            config,
            templatePools,
            2,
          );
          plan = sanityRetryResult.plan;
          templateInfo = sanityRetryResult.templateInfo;
          if (enforceVNext) {
            await runGuardrailsAndThrow(
              plan,
              request.profile.dietKey,
              language,
            );
          }
          sanity = validateMealPlanSanity(plan);
        } catch {
          // Keep original sanity result for throw
        }
      }
      await enrichPlanWithCanonicalIngredientIds(plan);
      await applyPrefilledAndAttachProvenance(
        plan,
        request,
        options ?? {},
        rules,
      );
      attachGuardrailsMeta(
        plan,
        !!guardrailsConstraintsText?.trim(),
        guardrailsMeta.contentHash,
        guardrailsMeta.version,
      );
      attachGeneratorMeta(plan, {
        mode: 'template',
        attempts: templateAttempts,
        ...(templateRetryReason && { retryReason: templateRetryReason }),
        templateInfo,
        poolMetrics,
        ...(guardrailsTerms.length > 0 && {
          guardrailsExcludeTermsCount: guardrailsTerms.length,
        }),
        sanity: { ok: sanity.ok, issues: sanity.issues },
      });
      attachTherapeuticMetadata(plan, request);
      throwIfSanityFailed(sanity);
      return plan;
    }

    // Gemini path: sanitize pool (no guardrails extra terms; template path did its own sanitize above)
    const { pool: candidates, metrics: poolMetrics } = sanitizeCandidatePool(
      rawCandidates,
      excludeTerms,
    );

    // Step 5: Build original prompt with candidates (guidance from messages, no hardcoded text)
    const shakeSmoothieGuidance = getShakeSmoothieGuidance(language);
    const maxAiSlotsForPlan = options?.maxAiSlotsForPlan;
    const varietyTargetsForPrompt = options?.varietyTargetsForPrompt;
    const originalPrompt = buildMealPlanPrompt({
      request,
      rules,
      candidates,
      language,
      guardrailsConstraintsText,
      shakeSmoothieGuidance,
      ...(maxAiSlotsForPlan !== undefined && { maxAiSlots: maxAiSlotsForPlan }),
      ...(varietyTargetsForPrompt && { varietyTargetsForPrompt }),
    });

    // Step 6: Use flattened JSON schema (Gemini has a max nesting depth limit)
    const jsonSchema = getMealPlanResponseJsonSchemaForGemini();

    // Step 7: Generate attempt #1
    const gemini = getGeminiClient();
    let rawJson: string;
    try {
      rawJson = await gemini.generateJson({
        prompt: originalPrompt,
        jsonSchema,
        temperature: 0.4,
        purpose: 'plan',
        maxOutputTokens: MEAL_PLAN_JSON_MAX_TOKENS,
      });
    } catch (error) {
      throw new Error(
        `Failed to generate meal plan from Gemini API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Step 8: Try to parse and validate
    const firstAttemptResult = await this.parseAndValidate(
      rawJson,
      request,
      rules,
    );

    // Step 9: If successful, enforce vNext guard rails (if enabled). Bij FORCE-deficit: max 1 retry met deficit-hint in prompt.
    if (firstAttemptResult.success) {
      const enforceVNext =
        process.env.ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER === 'true';
      if (enforceVNext) {
        try {
          await runGuardrailsAndThrow(
            firstAttemptResult.response!,
            request.profile.dietKey,
            language,
          );
        } catch (guardError) {
          const forceDeficits =
            guardError instanceof AppError &&
            guardError.code === 'GUARDRAILS_VIOLATION' &&
            guardError.guardrailsDetails?.forceDeficits;
          if (forceDeficits && forceDeficits.length > 0) {
            const retryPrompt = buildMealPlanPrompt({
              request,
              rules,
              candidates,
              language,
              forceDeficitHint: {
                categoryNames: forceDeficits.map((d) => d.categoryNameNl),
              },
              guardrailsConstraintsText,
              shakeSmoothieGuidance,
              ...(maxAiSlotsForPlan !== undefined && {
                maxAiSlots: maxAiSlotsForPlan,
              }),
              ...(varietyTargetsForPrompt && { varietyTargetsForPrompt }),
            });
            let retryRawJson: string;
            try {
              retryRawJson = await gemini.generateJson({
                prompt: retryPrompt,
                jsonSchema,
                temperature: 0.3,
                purpose: 'plan',
                maxOutputTokens: MEAL_PLAN_JSON_MAX_TOKENS,
              });
            } catch {
              throw guardError;
            }
            const retryResult = await this.parseAndValidate(
              retryRawJson,
              request,
              rules,
            );
            if (!retryResult.success) {
              throw guardError;
            }
            await runGuardrailsAndThrow(
              retryResult.response!,
              request.profile.dietKey,
              language,
            );
            const plan = retryResult.response!;
            const sanity = validateMealPlanSanity(plan);
            await applyPrefilledAndAttachProvenance(
              plan,
              request,
              options,
              rules,
            );
            validateCulinaryCoherence(plan, options?.culinaryRules ?? []);
            throwIfDbCoverageTooLow(
              plan,
              options?.minDbRecipeCoverageRatio,
              options?.allowDbCoverageFallback,
            );
            throwIfAiBudgetExceeded(plan, options?.maxAiSlotsForPlan);
            attachGuardrailsMeta(
              plan,
              !!guardrailsConstraintsText?.trim(),
              guardrailsMeta.contentHash,
              guardrailsMeta.version,
            );
            attachGeneratorMeta(plan, {
              mode: 'gemini',
              attempts: 2,
              retryReason: 'GUARDRAILS_VIOLATION',
              poolMetrics,
              sanity: { ok: sanity.ok, issues: sanity.issues },
            });
            attachTherapeuticMetadata(plan, request);
            throwIfSanityFailed(sanity);
            return plan;
          }
          throw guardError;
        }
      }
      let plan = firstAttemptResult.response!;
      let sanity = validateMealPlanSanity(plan);
      if (!sanity.ok) {
        try {
          const sanityRetryRawJson = await gemini.generateJson({
            prompt: originalPrompt,
            jsonSchema,
            temperature: 0.3,
            purpose: 'plan',
            maxOutputTokens: MEAL_PLAN_JSON_MAX_TOKENS,
          });
          const sanityRetryResult = await this.parseAndValidate(
            sanityRetryRawJson,
            request,
            rules,
          );
          if (sanityRetryResult.success && sanityRetryResult.response) {
            const sanityPlan: MealPlanResponse = sanityRetryResult.response;
            const enforceVNext =
              process.env.ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER === 'true';
            if (enforceVNext) {
              await runGuardrailsAndThrow(
                sanityPlan,
                request.profile.dietKey,
                language,
              );
            }
            sanity = validateMealPlanSanity(sanityPlan);
            if (sanity.ok) plan = sanityPlan;
          }
        } catch {
          // Keep original plan and sanity for attach + throw
        }
      }
      await enrichPlanWithCanonicalIngredientIds(plan);
      await applyPrefilledAndAttachProvenance(plan, request, options, rules);
      validateCulinaryCoherence(plan, options?.culinaryRules ?? []);
      throwIfDbCoverageTooLow(
        plan,
        options?.minDbRecipeCoverageRatio,
        options?.allowDbCoverageFallback,
      );
      throwIfAiBudgetExceeded(plan, options?.maxAiSlotsForPlan);
      attachGuardrailsMeta(
        plan,
        !!guardrailsConstraintsText?.trim(),
        guardrailsMeta.contentHash,
        guardrailsMeta.version,
      );
      attachGeneratorMeta(plan, {
        mode: 'gemini',
        attempts: 1,
        poolMetrics,
        sanity: { ok: sanity.ok, issues: sanity.issues },
      });
      attachTherapeuticMetadata(plan, request);
      throwIfSanityFailed(sanity);
      return plan;
    }

    // Step 10: Repair attempt (max 1 attempt)
    const issues = firstAttemptResult.issues.join('\n');
    const hasShakeSmoothiePreference =
      hasShakeSmoothiePreferenceInRequest(request);
    const repairPrompt = buildRepairPrompt({
      originalPrompt,
      badOutput: rawJson,
      issues,
      responseJsonSchema: jsonSchema,
      hasShakeSmoothiePreference,
    });

    // Call Gemini with lower temperature for repair
    let repairRawJson: string;
    try {
      repairRawJson = await gemini.generateJson({
        prompt: repairPrompt,
        jsonSchema,
        temperature: 0.2, // Lower temperature for more deterministic repair
        purpose: 'repair',
        maxOutputTokens: MEAL_PLAN_JSON_MAX_TOKENS,
      });
    } catch (error) {
      throw new Error(
        `Meal plan generation failed after repair attempt: API error - ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Step 11: Parse and validate repair attempt
    const repairResult = await this.parseAndValidate(
      repairRawJson,
      request,
      rules,
    );

    // Step 12: If repair successful, enforce vNext guard rails (if enabled). Geen extra deficit-retry hier (max 1 deficit-retry per aanroep, die gebeurt na eerste poging).
    if (repairResult.success) {
      const enforceVNext =
        process.env.ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER === 'true';
      if (enforceVNext) {
        await runGuardrailsAndThrow(
          repairResult.response!,
          request.profile.dietKey,
          language,
        );
      }
      const plan = repairResult.response!;
      const sanity = validateMealPlanSanity(plan);
      await enrichPlanWithCanonicalIngredientIds(plan);
      await applyPrefilledAndAttachProvenance(plan, request, options, rules);
      validateCulinaryCoherence(plan, options?.culinaryRules ?? []);
      throwIfDbCoverageTooLow(
        plan,
        options?.minDbRecipeCoverageRatio,
        options?.allowDbCoverageFallback,
      );
      throwIfAiBudgetExceeded(plan, options?.maxAiSlotsForPlan);
      attachGuardrailsMeta(
        plan,
        !!guardrailsConstraintsText?.trim(),
        guardrailsMeta.contentHash,
        guardrailsMeta.version,
      );
      attachGeneratorMeta(plan, {
        mode: 'gemini',
        attempts: 2,
        retryReason: 'AI_PARSE',
        poolMetrics,
        sanity: { ok: sanity.ok, issues: sanity.issues },
      });
      attachTherapeuticMetadata(plan, request);
      throwIfSanityFailed(sanity);
      return plan;
    }

    // Step 13: Repair failed - throw error
    throw new Error(
      `Meal plan generation failed after repair attempt: ${repairResult.issues.join('; ')}`,
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
    rules: ReturnType<typeof deriveDietRuleSet>,
  ): Promise<{
    success: boolean;
    response?: MealPlanResponse;
    issues: string[];
  }> {
    const issues: string[] = [];
    const normalized = normalizeJsonFromModel(rawJson);

    // Try JSON parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(normalized);
    } catch (error) {
      issues.push(
        `JSON parse error: ${error instanceof Error ? error.message : 'Unknown parse error'}`,
      );
      return { success: false, issues };
    }

    // Try Zod schema validation
    let response: MealPlanResponse;
    try {
      response = mealPlanResponseSchema.parse(parsed);
    } catch (error) {
      issues.push(
        `Schema validation error: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
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

    // Shadow mode: vNext guard rails evaluation (feature flag)
    const useVNextGuardrails = process.env.USE_VNEXT_GUARDRAILS === 'true';
    if (useVNextGuardrails) {
      try {
        await runGuardrailsAndThrow(response, request.profile.dietKey, 'nl');
      } catch (error) {
        // Don't fail the request if vNext evaluation fails
        console.error(
          '[MealPlanner] vNext guard rails evaluation failed:',
          error,
        );
      }
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

    // Step 2: Build candidate pool (expand allergies so pool excludes yoghurt/melk when Lactose, etc.)
    const excludeTerms = [
      ...getExpandedAllergenTermsForExclusion(request.profile.allergies),
      ...request.profile.dislikes,
      ...(request.excludeIngredients || []),
    ];
    const candidates = await getCandidatePool(
      request.profile.dietKey,
      excludeTerms,
    );

    const constraintsResult = await getConstraintsText({
      dietId: request.profile.dietKey,
      locale: language,
      mode: 'meal_planner',
    });
    const guardrailsConstraintsText = constraintsResult.promptText;

    // Step 3: Build day prompt with minimal-change instructions if existingDay provided
    const dayShakeGuidance = getShakeSmoothieGuidance(language);
    const dayPrompt = buildMealPlanDayPrompt({
      date,
      request,
      rules,
      candidates,
      existingDay,
      language,
      guardrailsConstraintsText,
      shakeSmoothieGuidance: dayShakeGuidance,
    });

    // Step 4: Convert Zod schema to JSON schema for single day
    const jsonSchema = zodToJsonSchema(mealPlanDayResponseSchema, {
      name: 'MealPlanDayResponse',
      target: 'openApi3',
    });

    // Step 5: Generate attempt #1
    const gemini = getGeminiClient();
    let rawJson: string;
    try {
      rawJson = await gemini.generateJson({
        prompt: dayPrompt,
        jsonSchema,
        temperature: 0.4,
        purpose: 'plan',
      });
    } catch (error) {
      throw new Error(
        `Failed to generate meal plan day from Gemini API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Step 6: Parse JSON
    let day: MealPlanDay;
    try {
      const parsed = JSON.parse(normalizeJsonFromModel(rawJson));
      const dayResponse: MealPlanDayResponse =
        mealPlanDayResponseSchema.parse(parsed);
      day = {
        date: dayResponse.date,
        meals: dayResponse.meals,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse meal plan day: ${error instanceof Error ? error.message : 'Unknown parse error'}`,
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
        await enrichDayWithCanonicalIngredientIds(day);
        return {
          day,
          adjustments: validationResult.adjustments,
        };
      }
    }

    // Step 8: If still has issues, attempt repair (max 1 attempt)
    if (validationResult.issues.length > 0) {
      const issues = validationResult.issues.map(
        (issue) => `${issue.code}: ${issue.message} (path: ${issue.path})`,
      );
      const repairPrompt = buildRepairPrompt({
        originalPrompt: dayPrompt,
        badOutput: rawJson,
        issues: issues.join('\n'),
        responseJsonSchema: jsonSchema,
        hasShakeSmoothiePreference:
          hasShakeSmoothiePreferenceInRequest(request),
      });

      // Call Gemini with lower temperature for repair
      let repairRawJson: string;
      try {
        repairRawJson = await gemini.generateJson({
          prompt: repairPrompt,
          jsonSchema,
          temperature: 0.2,
          purpose: 'repair',
        });
      } catch (error) {
        throw new Error(
          `Meal plan day generation failed after repair attempt: API error - ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      // Parse repair attempt
      try {
        const parsed = JSON.parse(normalizeJsonFromModel(repairRawJson));
        const dayResponse: MealPlanDayResponse =
          mealPlanDayResponseSchema.parse(parsed);
        day = {
          date: dayResponse.date,
          meals: dayResponse.meals,
        };
      } catch (error) {
        throw new Error(
          `Failed to parse repaired meal plan day: ${error instanceof Error ? error.message : 'Unknown parse error'}`,
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
          (issue) => `${issue.code}: ${issue.message}`,
        );
        throw new Error(
          `Meal plan day generation failed after repair attempt: ${remainingIssues.join('; ')}`,
        );
      }

      // Return with adjustments if any
      await enrichDayWithCanonicalIngredientIds(day);
      return {
        day,
        adjustments: repairValidationResult.adjustments,
      };
    }

    // Step 9: Success - return day with adjustments if any
    await enrichDayWithCanonicalIngredientIds(day);
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
    const {
      request,
      date,
      mealSlot,
      existingMeal,
      constraints,
      language = 'nl',
    } = args;

    // Step 1: Derive rules from profile
    const rules = deriveDietRuleSet(request.profile);

    // Step 2: Build candidate pool
    const excludeTerms = [
      ...getExpandedAllergenTermsForExclusion(request.profile.allergies),
      ...request.profile.dislikes,
      ...(request.excludeIngredients || []),
      ...(constraints?.avoidIngredients || []),
    ];
    const candidates = await getCandidatePool(
      request.profile.dietKey,
      excludeTerms,
    );

    const constraintsResult = await getConstraintsText({
      dietId: request.profile.dietKey,
      locale: language,
      mode: 'meal_planner',
    });
    const guardrailsConstraintsText = constraintsResult.promptText;

    // Step 3: Build meal prompt
    const mealShakeGuidance = getShakeSmoothieGuidance(language);
    const mealPrompt = buildMealPrompt({
      date,
      mealSlot,
      request,
      rules,
      candidates,
      existingMeal,
      constraints,
      language,
      guardrailsConstraintsText,
      shakeSmoothieGuidance: mealShakeGuidance,
    });

    // Step 4: Convert Zod schema to JSON schema for single meal
    const jsonSchema = zodToJsonSchema(mealResponseSchema, {
      name: 'MealResponse',
      target: 'openApi3',
    });

    // Step 5: Generate attempt #1
    const gemini = getGeminiClient();
    let rawJson: string;
    try {
      rawJson = await gemini.generateJson({
        prompt: mealPrompt,
        jsonSchema,
        temperature: 0.4,
        purpose: 'plan',
      });
    } catch (error) {
      throw new Error(
        `Failed to generate meal from Gemini API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Step 6: Parse JSON
    let mealResponse: MealResponse;
    try {
      const parsed = JSON.parse(normalizeJsonFromModel(rawJson));
      mealResponse = mealResponseSchema.parse(parsed);
    } catch (error) {
      throw new Error(
        `Failed to parse meal: ${error instanceof Error ? error.message : 'Unknown parse error'}`,
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
        (issue) =>
          issue.code === 'CALORIE_TARGET_MISS' ||
          issue.code === 'MACRO_TARGET_MISS',
      );
      const nonMacroIssues = validationResult.filter(
        (issue) =>
          issue.code !== 'CALORIE_TARGET_MISS' &&
          issue.code !== 'MACRO_TARGET_MISS',
      );

      // If only macro issues, try to adjust quantities
      if (macroOnlyIssues.length > 0 && nonMacroIssues.length === 0) {
        const { calcMealMacros } = await import('./mealPlannerAgent.tools');
        const currentMacros = await calcMealMacros(
          meal.ingredientRefs
            .filter((ref): ref is typeof ref & { nevoCode: string } =>
              Boolean(ref.nevoCode),
            )
            .map((ref) => ({
              nevoCode: ref.nevoCode,
              quantityG: ref.quantityG,
            })),
        );

        // Simple scaling: adjust all quantities proportionally to meet calorie target
        if (currentMacros.calories > 0) {
          const scale = constraints.targetCalories / currentMacros.calories;
          const adjustments: Array<{
            nevoCode: string;
            oldG: number;
            newG: number;
          }> = [];

          meal = {
            ...meal,
            ingredientRefs: meal.ingredientRefs.map((ref) => {
              const oldG = ref.quantityG;
              const newG = Math.max(1, Math.round(ref.quantityG * scale));
              if (ref.nevoCode) {
                adjustments.push({ nevoCode: ref.nevoCode, oldG, newG });
              }
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
        (issue) => `${issue.code}: ${issue.message} (path: ${issue.path})`,
      );
      const repairPrompt = buildRepairPrompt({
        originalPrompt: mealPrompt,
        badOutput: rawJson,
        issues: issues.join('\n'),
        responseJsonSchema: jsonSchema,
        hasShakeSmoothiePreference:
          hasShakeSmoothiePreferenceInRequest(request),
      });

      // Call Gemini with lower temperature for repair
      let repairRawJson: string;
      try {
        repairRawJson = await gemini.generateJson({
          prompt: repairPrompt,
          jsonSchema,
          temperature: 0.2,
          purpose: 'repair',
        });
      } catch (error) {
        throw new Error(
          `Meal generation failed after repair attempt: API error - ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      // Parse repair attempt
      try {
        const parsed = JSON.parse(normalizeJsonFromModel(repairRawJson));
        mealResponse = mealResponseSchema.parse(parsed);
        meal = mealResponse.meal;
      } catch (error) {
        throw new Error(
          `Failed to parse repaired meal: ${error instanceof Error ? error.message : 'Unknown parse error'}`,
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
          (issue) => `${issue.code}: ${issue.message}`,
        );
        throw new Error(
          `Meal generation failed after repair attempt: ${remainingIssues.join('; ')}`,
        );
      }
    }

    // Step 10: Success - return meal
    return { meal };
  }
}
