import type { SupabaseClient } from '@supabase/supabase-js';
import { ALL_CUSTOM_FOOD_KEYS } from '../custom/custom-foods-fields';

const FNDDS_LOCALE = 'nl-NL';

/** Normalize unit for comparison (µg -> ug, etc.). */
function normUnit(u: string): string {
  return (u ?? '').toLowerCase().replace(/µ/g, 'u').trim();
}

/**
 * Load FNDDS survey food by fdc_id and return a flat record with the same keys as NEVO/custom (for edit form).
 * Nutrient values come from fndds_survey_food_nutrients_normalized + nutrient_source_mappings so all
 * mapped FNDDS nutrients are shown (not only the pre-materialized mapped table).
 * Returns null if not found.
 */
export async function loadFnddsForEdit(
  supabase: SupabaseClient,
  fdcId: number,
): Promise<(Record<string, unknown> & { source: 'fndds_survey' }) | null> {
  const { data: food, error: foodError } = await supabase
    .from('fndds_survey_foods')
    .select('*')
    .eq('fdc_id', fdcId)
    .single();

  if (foodError || !food) return null;

  const { data: translation } = await supabase
    .from('fndds_survey_food_translations')
    .select('display_name, food_group_nl, food_group_en')
    .eq('fdc_id', fdcId)
    .eq('locale', FNDDS_LOCALE)
    .maybeSingle();

  const flat: Record<string, unknown> = {};
  for (const key of ALL_CUSTOM_FOOD_KEYS) {
    flat[key] = '';
  }
  flat.name_nl = translation?.display_name ?? food.description ?? '';
  flat.name_en = food.description ?? '';
  flat.food_group_nl = translation?.food_group_nl ?? '';
  flat.food_group_en = translation?.food_group_en ?? '';
  flat.quantity = 'per 100g';

  // Load nutrients from normalized + mappings (so we show everything we can map, even if map script not re-run)
  const { data: mappings } = await supabase
    .from('nutrient_source_mappings')
    .select(
      'nutrient_source_key, internal_nutrient_key, source_unit, internal_unit, multiplier',
    )
    .eq('source', 'fndds_survey')
    .eq('is_active', true);
  const mapByKey = new Map(
    (mappings ?? []).map((m) => [m.nutrient_source_key, m] as const),
  );

  const { data: normalizedRows } = await supabase
    .from('fndds_survey_food_nutrients_normalized')
    .select('nutrient_source_key, unit, amount_per_100g')
    .eq('fdc_id', fdcId);

  for (const row of normalizedRows ?? []) {
    const mapping = mapByKey.get(row.nutrient_source_key);
    if (
      !mapping ||
      !ALL_CUSTOM_FOOD_KEYS.includes(mapping.internal_nutrient_key)
    )
      continue;
    const amount =
      row.amount_per_100g != null ? Number(row.amount_per_100g) : null;
    if (amount == null || !Number.isFinite(amount)) continue;
    const sourceUnit = normUnit(mapping.source_unit);
    const rowUnit = normUnit(row.unit ?? '');
    if (sourceUnit !== rowUnit) continue;
    const value = amount * Number(mapping.multiplier ?? 1);
    flat[mapping.internal_nutrient_key] = value;
  }

  flat.source = 'fndds_survey';
  return flat as Record<string, unknown> & { source: 'fndds_survey' };
}
