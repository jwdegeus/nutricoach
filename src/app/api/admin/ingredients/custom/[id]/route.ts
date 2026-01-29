import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { NUMERIC_CUSTOM_FOOD_KEYS } from '@/src/app/(app)/admin/ingredients/custom/custom-foods-fields';
import {
  correctNutritionValues,
  validateNutritionValues,
} from '@/src/app/(app)/admin/ingredients/custom/nutrition-validation';

/**
 * GET /api/admin/ingredients/custom/[id]
 * Get single custom food by id (admin only).
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

    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('custom_foods')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Eigen ingrediënt niet gevonden',
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { ...data, source: 'custom' as const },
    });
  } catch (error) {
    console.error('Error fetching custom ingredient:', error);
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

/** All updatable custom_foods columns (same as POST body). */
const UPDATABLE_FIELDS = [
  'food_group_nl',
  'food_group_en',
  'name_nl',
  'name_en',
  'synonym',
  'quantity',
  'note',
  'contains_traces_of',
  'is_fortified_with',
  'energy_kj',
  'energy_kcal',
  'water_g',
  'protein_g',
  'protein_pl_g',
  'protein_drl_g',
  'nitrogen_g',
  'tryptophan_mg',
  'fat_g',
  'fatty_acids_g',
  'saturated_fat_g',
  'monounsaturated_fat_g',
  'polyunsaturated_fat_g',
  'omega3_fat_g',
  'omega6_fat_g',
  'trans_fat_g',
  'carbs_g',
  'sugar_g',
  'free_sugars_g',
  'starch_g',
  'polyols_g',
  'fiber_g',
  'alcohol_g',
  'organic_acids_g',
  'ash_g',
  'cholesterol_mg',
  'sodium_mg',
  'potassium_mg',
  'calcium_mg',
  'phosphorus_mg',
  'magnesium_mg',
  'iron_mg',
  'iron_haem_mg',
  'iron_non_haem_mg',
  'copper_mg',
  'selenium_ug',
  'zinc_mg',
  'iodine_ug',
  'vit_a_rae_ug',
  'vit_a_re_ug',
  'retinol_ug',
  'beta_carotene_total_ug',
  'alpha_carotene_ug',
  'lutein_ug',
  'zeaxanthin_ug',
  'beta_cryptoxanthin_ug',
  'lycopene_ug',
  'vit_d_ug',
  'vit_d3_ug',
  'vit_d2_ug',
  'vit_e_mg',
  'alpha_tocopherol_mg',
  'beta_tocopherol_mg',
  'delta_tocopherol_mg',
  'gamma_tocopherol_mg',
  'vit_k_ug',
  'vit_k1_ug',
  'vit_k2_ug',
  'vit_b1_mg',
  'vit_b2_mg',
  'vit_b6_mg',
  'vit_b12_ug',
  'niacin_equiv_mg',
  'niacin_mg',
  'folate_equiv_ug',
  'folate_ug',
  'folic_acid_ug',
  'vit_c_mg',
] as const;

/**
 * PATCH /api/admin/ingredients/custom/[id]
 * Update a custom food (admin only). Body: subset of custom_foods fields.
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
            message: 'Alleen admins kunnen eigen ingredienten bewerken',
          },
        },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json();

    const name_nl = typeof body.name_nl === 'string' ? body.name_nl.trim() : '';
    if (!name_nl) {
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
    const update: Record<string, unknown> = {};
    for (const key of UPDATABLE_FIELDS) {
      if (key in body) {
        const v = body[key];
        update[key] =
          v === '' || v === undefined
            ? null
            : key === 'name_nl'
              ? name_nl
              : key === 'name_en'
                ? typeof v === 'string'
                  ? v.trim() || null
                  : null
                : typeof v === 'number' && Number.isFinite(v)
                  ? v
                  : typeof v === 'string'
                    ? v.trim() || null
                    : v;
      }
    }

    // Corrigeer en valideer voedingswaarden per 100g (bijv. 38758 → 38.758 voor sodium_mg)
    const corrected = correctNutritionValues(update, NUMERIC_CUSTOM_FOOD_KEYS);
    const validation = validateNutritionValues(
      corrected,
      NUMERIC_CUSTOM_FOOD_KEYS,
    );
    if (!validation.valid) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error,
          },
        },
        { status: 400 },
      );
    }
    Object.assign(update, corrected);

    const { data, error } = await supabase
      .from('custom_foods')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'DB_ERROR', message: error.message },
        },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Eigen ingrediënt niet gevonden',
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { ...data, source: 'custom' as const },
    });
  } catch (error) {
    console.error('Error updating custom ingredient:', error);
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
 * DELETE /api/admin/ingredients/custom/[id]
 * Delete a custom food (admin only).
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
            message: 'Alleen admins kunnen eigen ingredienten verwijderen',
          },
        },
        { status: 403 },
      );
    }

    const { id } = await params;
    const supabase = await createClient();
    const { error } = await supabase.from('custom_foods').delete().eq('id', id);

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
    console.error('Error deleting custom ingredient:', error);
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
