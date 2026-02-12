/**
 * Loads meal plan generator DB config (settings_v2, variety targets, culinary rules).
 * Server-only; RLS: runs in user context; SELECT only required columns.
 * Fallback: diet_key match first, then diet_key IS NULL (global default).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/src/lib/errors/app-error';

// ---------------------------------------------------------------------------
// Types (strict; match DB columns we select)
// ---------------------------------------------------------------------------

export type MealPlanGeneratorSettingsV2 = {
  diet_key: string | null;
  min_history_reuse_ratio: number;
  target_prefill_ratio: number;
  recency_window_days: number;
  max_ai_generated_slots_per_week: number;
  min_db_recipe_coverage_ratio: number;
  use_db_first: boolean;
  is_active: boolean;
  schema_version: number;
};

export type MealPlanVarietyTargetsV1 = {
  diet_key: string | null;
  unique_veg_min: number;
  unique_fruit_min: number;
  protein_rotation_min_categories: number;
  max_repeat_same_recipe_within_days: number;
  favorites_repeat_boost: number;
  is_active: boolean;
  schema_version: number;
};

export type MealPlanCulinaryRuleV1 = {
  rule_code: string;
  slot_type: string;
  match_mode: 'term' | 'regex';
  match_value: string;
  action: 'block' | 'warn';
  reason_code: string;
  priority: number;
  is_active: boolean;
  schema_version: number;
};

export type MealPlanGeneratorDbConfig = {
  settings: MealPlanGeneratorSettingsV2;
  varietyTargets: MealPlanVarietyTargetsV1;
  culinaryRules: MealPlanCulinaryRuleV1[];
};

const SETTINGS_SELECT =
  'diet_key, min_history_reuse_ratio, target_prefill_ratio, recency_window_days, max_ai_generated_slots_per_week, min_db_recipe_coverage_ratio, use_db_first, is_active, schema_version';
const VARIETY_SELECT =
  'diet_key, unique_veg_min, unique_fruit_min, protein_rotation_min_categories, max_repeat_same_recipe_within_days, favorites_repeat_boost, is_active, schema_version';
const CULINARY_SELECT =
  'rule_code, slot_type, match_mode, match_value, action, reason_code, priority, is_active, schema_version';

// ---------------------------------------------------------------------------
// Helper: load one active row with diet_key fallback (specific → global)
// ---------------------------------------------------------------------------

async function loadActiveRowWithDietFallback<T>(params: {
  supabase: SupabaseClient;
  table: 'meal_plan_generator_settings_v2' | 'meal_plan_variety_targets_v1';
  select: string;
  dietKey: string | null | undefined;
}): Promise<T | null> {
  const { supabase, table, select, dietKey } = params;
  const effectiveKey =
    dietKey != null && String(dietKey).trim() !== ''
      ? String(dietKey).trim()
      : null;

  // 1) If diet key provided: try specific row first
  if (effectiveKey !== null) {
    const { data: rows, error } = await supabase
      .from(table)
      .select(select)
      .eq('is_active', true)
      .eq('diet_key', effectiveKey)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error)
      throw new AppError(
        'MEAL_PLAN_CONFIG_INVALID',
        'Kon generatorconfiguratie niet laden.',
        { cause: error },
      );
    const row = rows?.[0];
    if (row) return row as T;
  }

  // 2) Fallback: global default (diet_key IS NULL)
  const { data: rows, error } = await supabase
    .from(table)
    .select(select)
    .eq('is_active', true)
    .is('diet_key', null)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error)
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Kon generatorconfiguratie niet laden.',
      { cause: error },
    );
  const row = rows?.[0];
  return (row as T) ?? null;
}

function ensureNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapSettingsRow(
  row: Record<string, unknown>,
): MealPlanGeneratorSettingsV2 {
  return {
    diet_key: row.diet_key as string | null,
    min_history_reuse_ratio: ensureNumber(row.min_history_reuse_ratio, 0.2),
    target_prefill_ratio: ensureNumber(row.target_prefill_ratio, 0.7),
    recency_window_days: ensureNumber(row.recency_window_days, 90),
    max_ai_generated_slots_per_week: ensureNumber(
      row.max_ai_generated_slots_per_week,
      14,
    ),
    min_db_recipe_coverage_ratio: ensureNumber(
      row.min_db_recipe_coverage_ratio,
      0.5,
    ),
    use_db_first: row.use_db_first === true,
    is_active: row.is_active === true,
    schema_version: ensureNumber(row.schema_version, 1),
  };
}

function mapVarietyRow(row: Record<string, unknown>): MealPlanVarietyTargetsV1 {
  return {
    diet_key: row.diet_key as string | null,
    unique_veg_min: ensureNumber(row.unique_veg_min, 5),
    unique_fruit_min: ensureNumber(row.unique_fruit_min, 3),
    protein_rotation_min_categories: ensureNumber(
      row.protein_rotation_min_categories,
      3,
    ),
    max_repeat_same_recipe_within_days: ensureNumber(
      row.max_repeat_same_recipe_within_days,
      7,
    ),
    favorites_repeat_boost: ensureNumber(row.favorites_repeat_boost, 1),
    is_active: row.is_active === true,
    schema_version: ensureNumber(row.schema_version, 1),
  };
}

function mapCulinaryRow(row: Record<string, unknown>): MealPlanCulinaryRuleV1 {
  return {
    rule_code: String(row.rule_code ?? ''),
    slot_type: String(row.slot_type ?? ''),
    match_mode: row.match_mode === 'regex' ? 'regex' : 'term',
    match_value: String(row.match_value ?? ''),
    action: row.action === 'warn' ? 'warn' : 'block',
    reason_code: String(row.reason_code ?? ''),
    priority: ensureNumber(row.priority, 0),
    is_active: row.is_active === true,
    schema_version: ensureNumber(row.schema_version, 1),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load active generator DB config for a diet key (with fallback to global defaults).
 * RLS: uses provided Supabase client (user context); no service_role.
 * Throws AppError MEAL_PLAN_CONFIG_INVALID if global defaults are missing.
 */
export async function loadMealPlanGeneratorDbConfig(
  supabase: SupabaseClient,
  dietKey?: string | null,
): Promise<MealPlanGeneratorDbConfig> {
  const settingsRow = await loadActiveRowWithDietFallback<
    Record<string, unknown>
  >({
    supabase,
    table: 'meal_plan_generator_settings_v2',
    select: SETTINGS_SELECT,
    dietKey,
  });

  if (!settingsRow) {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Geen actieve generatorinstellingen gevonden. Configureer minimaal een globale default in de database.',
    );
  }

  const varietyRow = await loadActiveRowWithDietFallback<
    Record<string, unknown>
  >({
    supabase,
    table: 'meal_plan_variety_targets_v1',
    select: VARIETY_SELECT,
    dietKey,
  });

  if (!varietyRow) {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Geen actieve variëteitsdoelen gevonden. Configureer minimaal een globale default in de database.',
    );
  }

  const { data: culinaryRows, error: culinaryError } = await supabase
    .from('meal_plan_culinary_rules_v1')
    .select(CULINARY_SELECT)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (culinaryError) {
    throw new AppError(
      'MEAL_PLAN_CONFIG_INVALID',
      'Kon culinaire regels niet laden.',
      { cause: culinaryError },
    );
  }

  return {
    settings: mapSettingsRow(settingsRow),
    varietyTargets: mapVarietyRow(varietyRow),
    culinaryRules: (culinaryRows ?? []).map(mapCulinaryRow),
  };
}
