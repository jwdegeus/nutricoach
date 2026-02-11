'use server';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import type { MealSlot } from '@/src/lib/diets';
import type {
  DashboardTopMeal,
  DashboardFamilyMember,
  DashboardPageData,
} from './dashboard.types';

/**
 * Single user-context fetch, then parallel data queries.
 * Memoized per request (React cache) to avoid duplicate Supabase calls
 * when called from nested components.
 * User-specific: never cross-request cache; RLS + auth scope per request.
 */
export const getDashboardData = cache(async (): Promise<DashboardPageData> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [topMeals, members] = await Promise.all([
    getTopMealsForDashboard(supabase, user.id),
    getFamilyMembersForDashboard(supabase, user.id),
  ]);

  return { topMeals, members };
});

async function getTopMealsForDashboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<DashboardTopMeal[]> {
  const { data, error } = await supabase
    .from('custom_meals')
    .select('id, name, meal_slot, consumption_count')
    .eq('user_id', userId)
    .order('consumption_count', { ascending: false })
    .order('last_consumed_at', { ascending: false, nullsFirst: false })
    .limit(5);

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    mealSlot: row.meal_slot as MealSlot,
    consumptionCount: row.consumption_count ?? 0,
  }));
}

async function getFamilyMembersForDashboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<DashboardFamilyMember[]> {
  const { data, error } = await supabase
    .from('family_members')
    .select('id, name, is_self, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return [];

  let rows = data ?? [];

  if (rows.length === 0) {
    const { data: inserted, error: insertErr } = await supabase
      .from('family_members')
      .insert({
        user_id: userId,
        name: 'Ik',
        is_self: true,
        sort_order: 0,
      })
      .select('id, name, is_self, sort_order')
      .single();

    if (insertErr) return [];
    rows = inserted ? [inserted] : [];
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    is_self: row.is_self ?? false,
  }));
}
