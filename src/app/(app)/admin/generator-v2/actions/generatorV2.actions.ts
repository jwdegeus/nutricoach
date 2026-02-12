'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { revalidatePath } from 'next/cache';

export type GeneratorV2Settings = {
  id: string;
  diet_key: string | null;
  use_db_first: boolean;
  min_history_reuse_ratio: number;
  target_prefill_ratio: number;
  recency_window_days: number;
  max_ai_generated_slots_per_week: number;
  min_db_recipe_coverage_ratio: number;
};

type ActionResult<T> = { data: T } | { error: string };

export async function getGeneratorV2SettingsAction(): Promise<
  ActionResult<GeneratorV2Settings[]>
> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('meal_plan_generator_settings_v2')
    .select(
      'id, diet_key, use_db_first, min_history_reuse_ratio, target_prefill_ratio, recency_window_days, max_ai_generated_slots_per_week, min_db_recipe_coverage_ratio',
    )
    .eq('is_active', true)
    .order('diet_key', { ascending: true, nullsFirst: true });

  if (error) {
    return { error: error.message };
  }
  return { data: (data ?? []) as GeneratorV2Settings[] };
}

export async function updateUseDbFirstAction(
  id: string,
  useDbFirst: boolean,
): Promise<ActionResult<void>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('meal_plan_generator_settings_v2')
    .update({ use_db_first: useDbFirst })
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }
  revalidatePath('/admin/generator-v2');
  revalidatePath('/meal-plans');
  return { data: undefined };
}
