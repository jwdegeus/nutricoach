import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import {
  ALL_CUSTOM_FOOD_KEYS,
  NUMERIC_CUSTOM_FOOD_KEYS,
} from '@/src/app/(app)/admin/ingredients/custom/custom-foods-fields';

const FNDDS_LOCALE = 'nl-NL';

/** Derive internal_unit from internal_nutrient_key (same as nevo_foods / nutrition-calculator). */
function unitForKey(key: string): string {
  if (key === 'energy_kj') return 'kj';
  if (key === 'energy_kcal') return 'kcal';
  if (key.endsWith('_ug')) return 'ug';
  if (key.endsWith('_mg')) return 'mg';
  if (key.endsWith('_g')) return 'g';
  return 'g';
}

/**
 * GET /api/admin/ingredients/fndds/[id]
 * Get single FNDDS survey food by fdc_id, as flat record (same shape as NEVO/custom for edit form).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Alleen admins kunnen ingrediënten bekijken',
          },
        },
        { status: 403 },
      );
    }

    const fdcId = parseInt((await params).id, 10);
    if (Number.isNaN(fdcId)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ongeldig FNDDS fdc_id',
          },
        },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data: food, error: foodError } = await supabase
      .from('fndds_survey_foods')
      .select('*')
      .eq('fdc_id', fdcId)
      .single();

    if (foodError || !food) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'FNDDS-ingrediënt niet gevonden',
          },
        },
        { status: 404 },
      );
    }

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

    // Nutrients from normalized + mappings (so all mapped FNDDS nutrients show on edit form)
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
    const normUnit = (u: string) =>
      (u ?? '').toLowerCase().replace(/µ/g, 'u').trim();
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
      if (normUnit(mapping.source_unit) !== normUnit(row.unit ?? '')) continue;
      const value = amount * Number(mapping.multiplier ?? 1);
      flat[mapping.internal_nutrient_key] = value;
    }
    flat.source = 'fndds_survey';

    return NextResponse.json({
      ok: true,
      data: flat,
    });
  } catch (error) {
    console.error('Error fetching FNDDS ingredient:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'FETCH_ERROR',
          message: error instanceof Error ? error.message : 'Onbekende fout',
        },
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/ingredients/fndds/[id]
 * Update FNDDS survey food: description, translations (display_name, food_group), mapped nutrients.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Alleen admins kunnen FNDDS-ingrediënten bewerken',
          },
        },
        { status: 403 },
      );
    }

    const fdcId = parseInt((await params).id, 10);
    if (Number.isNaN(fdcId)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ongeldig FNDDS fdc_id',
          },
        },
        { status: 400 },
      );
    }

    const body = await request.json();
    const nameNl = typeof body.name_nl === 'string' ? body.name_nl.trim() : '';
    if (!nameNl) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Naam (NL) is vereist',
          },
        },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const nameEn =
      typeof body.name_en === 'string' ? body.name_en.trim() : null;
    const { error: updateFoodError } = await supabase
      .from('fndds_survey_foods')
      .update({ description: nameEn ?? nameNl })
      .eq('fdc_id', fdcId);

    if (updateFoodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'DB_ERROR', message: updateFoodError.message },
        },
        { status: 500 },
      );
    }

    const foodGroupNl =
      typeof body.food_group_nl === 'string'
        ? body.food_group_nl.trim() || null
        : null;
    const foodGroupEn =
      typeof body.food_group_en === 'string'
        ? body.food_group_en.trim() || null
        : null;

    const { error: upsertTransError } = await supabase
      .from('fndds_survey_food_translations')
      .upsert(
        {
          fdc_id: fdcId,
          locale: FNDDS_LOCALE,
          display_name: nameNl,
          food_group_nl: foodGroupNl,
          food_group_en: foodGroupEn,
          status: 'reviewed',
        },
        { onConflict: 'fdc_id,locale' },
      );

    if (upsertTransError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'DB_ERROR', message: upsertTransError.message },
        },
        { status: 500 },
      );
    }

    const numericKeys = Array.from(NUMERIC_CUSTOM_FOOD_KEYS);
    const toUpsert: {
      fdc_id: number;
      internal_nutrient_key: string;
      internal_unit: string;
      amount_per_100g: number | null;
      source: string;
    }[] = [];
    const toDeleteKeys: string[] = [];

    for (const key of numericKeys) {
      const v = body[key];
      const num =
        typeof v === 'number' && Number.isFinite(v)
          ? v
          : typeof v === 'string' && v.trim() !== ''
            ? parseFloat(v.trim())
            : null;
      if (num != null && Number.isFinite(num)) {
        toUpsert.push({
          fdc_id: fdcId,
          internal_nutrient_key: key,
          internal_unit: unitForKey(key),
          amount_per_100g: num,
          source: 'fndds_survey',
        });
      } else {
        toDeleteKeys.push(key);
      }
    }

    if (toDeleteKeys.length > 0) {
      const { error: delError } = await supabase
        .from('fndds_survey_food_nutrients_mapped')
        .delete()
        .eq('fdc_id', fdcId)
        .in('internal_nutrient_key', toDeleteKeys);
      if (delError) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: 'DB_ERROR', message: delError.message },
          },
          { status: 500 },
        );
      }
    }

    if (toUpsert.length > 0) {
      const { error: upsertMapError } = await supabase
        .from('fndds_survey_food_nutrients_mapped')
        .upsert(toUpsert, {
          onConflict: 'fdc_id,internal_nutrient_key',
        });
      if (upsertMapError) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: 'DB_ERROR', message: upsertMapError.message },
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      data: { fdc_id: fdcId, source: 'fndds_survey' as const },
    });
  } catch (error) {
    console.error('Error updating FNDDS ingredient:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Onbekende fout',
        },
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/ingredients/fndds/[id]
 * Delete FNDDS survey food (cascade removes translations and mapped nutrients).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Alleen admins kunnen FNDDS-ingrediënten verwijderen',
          },
        },
        { status: 403 },
      );
    }

    const fdcId = parseInt((await params).id, 10);
    if (Number.isNaN(fdcId)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ongeldig FNDDS fdc_id',
          },
        },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('fndds_survey_foods')
      .delete()
      .eq('fdc_id', fdcId);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'DB_ERROR', message: error.message },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting FNDDS ingredient:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'DELETE_ERROR',
          message: error instanceof Error ? error.message : 'Onbekende fout',
        },
      },
      { status: 500 },
    );
  }
}
