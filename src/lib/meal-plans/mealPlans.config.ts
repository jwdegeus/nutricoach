/**
 * Meal planner config – loaded from config file and env.
 * No hardcoded business values; edit config/meal-planner.json or set env vars.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type MealPlannerConfig = {
  targetReuseRatio: number;
  prefillFetchLimitMax: number;
  forbiddenPatternsInShakeSmoothie: string[];
};

const DEFAULTS: MealPlannerConfig = {
  targetReuseRatio: 0.8,
  prefillFetchLimitMax: 20,
  forbiddenPatternsInShakeSmoothie: [],
};

let cached: MealPlannerConfig | null = null;

function loadConfig(): MealPlannerConfig {
  if (cached) return cached;
  const configPath =
    process.env.MEAL_PLANNER_CONFIG_PATH ??
    join(process.cwd(), 'config', 'meal-planner.json');
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<MealPlannerConfig>;
      cached = {
        targetReuseRatio:
          typeof parsed.targetReuseRatio === 'number'
            ? parsed.targetReuseRatio
            : DEFAULTS.targetReuseRatio,
        prefillFetchLimitMax:
          typeof parsed.prefillFetchLimitMax === 'number'
            ? parsed.prefillFetchLimitMax
            : DEFAULTS.prefillFetchLimitMax,
        forbiddenPatternsInShakeSmoothie: Array.isArray(
          parsed.forbiddenPatternsInShakeSmoothie,
        )
          ? parsed.forbiddenPatternsInShakeSmoothie.filter(
              (p): p is string => typeof p === 'string' && p.trim().length > 0,
            )
          : DEFAULTS.forbiddenPatternsInShakeSmoothie,
      };
      return cached;
    } catch {
      cached = { ...DEFAULTS };
      return cached;
    }
  }
  const fromEnv = {
    targetReuseRatio:
      process.env.MEAL_PLANNER_TARGET_REUSE_RATIO != null
        ? Number(process.env.MEAL_PLANNER_TARGET_REUSE_RATIO)
        : DEFAULTS.targetReuseRatio,
    prefillFetchLimitMax:
      process.env.MEAL_PLANNER_PREFILL_FETCH_LIMIT_MAX != null
        ? Number(process.env.MEAL_PLANNER_PREFILL_FETCH_LIMIT_MAX)
        : DEFAULTS.prefillFetchLimitMax,
    forbiddenPatternsInShakeSmoothie: DEFAULTS.forbiddenPatternsInShakeSmoothie,
  };
  cached = fromEnv;
  return cached;
}

/** Get meal planner config (file + env). Reset cache for tests with resetMealPlannerConfigCache(). */
export function getMealPlannerConfig(): MealPlannerConfig {
  return loadConfig();
}

/** Only for tests – reset in-memory cache so config is re-read. */
export function resetMealPlannerConfigCache(): void {
  cached = null;
}
