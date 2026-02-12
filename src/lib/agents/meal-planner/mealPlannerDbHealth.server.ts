/**
 * Meal Planner DB Health Snapshot (server-only)
 *
 * Fetches a compact DB health snapshot for custom_meals per slot when
 * MEAL_PLANNER_DEBUG_LOG=true. Used to diagnose whether plan failures
 * are due to data (insufficient pool) or rules.
 *
 * No schema changes. No persistence. RLS respected via user-context client.
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const DB_HEALTH_COLUMNS = 'id,meal_slot,weekmenu_slots,meal_data';
const DB_HEALTH_LIMIT = 2000;

export type SlotHealthCounts = {
  totalCustomMeals: number;
  withIngredientRefs: number;
  /** NEVO refs from meal_data.ingredientRefs[].nevoCode; 0 when none. */
  withNevoRefs: number;
  classifiedForSlot: number;
};

export type DbHealthSnapshotData = {
  runId: string;
  planId?: string | null;
  bySlot: {
    breakfast: SlotHealthCounts;
    lunch: SlotHealthCounts;
    dinner: SlotHealthCounts;
    unclassified: SlotHealthCounts;
  };
  totals: {
    total: number;
    withIngredientRefs: number;
    withNevoRefs: number;
  };
};

function belongsToSlot(
  mealSlot: string | null,
  weekmenuSlots: string[] | null,
  slot: 'breakfast' | 'lunch' | 'dinner',
): boolean {
  const wm = Array.isArray(weekmenuSlots) ? weekmenuSlots : [];
  if (wm.length > 0) return wm.includes(slot);
  return mealSlot === slot;
}

function isUnclassified(
  mealSlot: string | null,
  weekmenuSlots: string[] | null,
): boolean {
  const wm = Array.isArray(weekmenuSlots) ? weekmenuSlots : [];
  if (wm.length > 0) return false;
  return !mealSlot || !['breakfast', 'lunch', 'dinner'].includes(mealSlot);
}

function hasIngredientRefs(mealData: unknown): boolean {
  if (!mealData || typeof mealData !== 'object') return false;
  const refs = (mealData as Record<string, unknown>).ingredientRefs;
  return Array.isArray(refs) && refs.length > 0;
}

function hasNevoRefs(mealData: unknown): boolean {
  if (!mealData || typeof mealData !== 'object') return false;
  const refs = (mealData as Record<string, unknown>).ingredientRefs;
  if (!Array.isArray(refs)) return false;
  return refs.some(
    (r: unknown) =>
      r &&
      typeof r === 'object' &&
      'nevoCode' in r &&
      (r as { nevoCode?: unknown }).nevoCode != null,
  );
}

/**
 * Fetches DB health snapshot for custom_meals. Only call when MEAL_PLANNER_DEBUG_LOG=true.
 * Uses single query with minimal columns. Aggregates in JS.
 */
export async function fetchDbHealthSnapshot(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
  planId?: string | null,
): Promise<DbHealthSnapshotData> {
  const { data: rows } = await supabase
    .from('custom_meals')
    .select(DB_HEALTH_COLUMNS)
    .eq('user_id', userId)
    .limit(DB_HEALTH_LIMIT);

  const items = (rows ?? []) as Array<{
    id: string;
    meal_slot: string | null;
    weekmenu_slots: string[] | null;
    meal_data: unknown;
  }>;

  const emptySlot: SlotHealthCounts = {
    totalCustomMeals: 0,
    withIngredientRefs: 0,
    withNevoRefs: 0,
    classifiedForSlot: 0,
  };

  const bySlot: DbHealthSnapshotData['bySlot'] = {
    breakfast: { ...emptySlot },
    lunch: { ...emptySlot },
    dinner: { ...emptySlot },
    unclassified: { ...emptySlot },
  };

  let totalWithRefs = 0;
  let totalWithNevo = 0;

  for (const row of items) {
    const slot = row.meal_slot;
    const wm = row.weekmenu_slots;
    const hasRefs = hasIngredientRefs(row.meal_data);
    const hasNevo = hasNevoRefs(row.meal_data);
    if (hasRefs) totalWithRefs++;
    if (hasNevo) totalWithNevo++;

    if (isUnclassified(slot, wm)) {
      bySlot.unclassified.totalCustomMeals++;
      bySlot.unclassified.classifiedForSlot++;
      if (hasRefs) bySlot.unclassified.withIngredientRefs++;
      if (hasNevo) bySlot.unclassified.withNevoRefs++;
      continue;
    }

    for (const s of ['breakfast', 'lunch', 'dinner'] as const) {
      if (belongsToSlot(slot, wm, s)) {
        bySlot[s].totalCustomMeals++;
        bySlot[s].classifiedForSlot++;
        if (hasRefs) bySlot[s].withIngredientRefs++;
        if (hasNevo) bySlot[s].withNevoRefs++;
      }
    }
  }

  return {
    runId,
    planId: planId ?? null,
    bySlot,
    totals: {
      total: items.length,
      withIngredientRefs: totalWithRefs,
      withNevoRefs: totalWithNevo,
    },
  };
}
