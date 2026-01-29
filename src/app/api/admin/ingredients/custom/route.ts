import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

/**
 * POST /api/admin/ingredients/custom
 * Create a new custom food (admin only).
 * Body: same fields as custom_foods table (name_nl required; nutrient fields optional).
 */
export async function POST(request: NextRequest) {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Alleen admins kunnen eigen ingredienten aanmaken',
          },
        },
        { status: 403 },
      );
    }

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

    const row: Record<string, unknown> = {
      food_group_nl: body.food_group_nl ?? 'Overig',
      food_group_en: body.food_group_en ?? 'Other',
      name_nl,
      name_en: body.name_en ?? null,
      synonym: body.synonym ?? null,
      quantity: body.quantity ?? 'per 100g',
      note: body.note ?? null,
      contains_traces_of: body.contains_traces_of ?? null,
      is_fortified_with: body.is_fortified_with ?? null,
      energy_kj: body.energy_kj ?? null,
      energy_kcal: body.energy_kcal ?? null,
      water_g: body.water_g ?? null,
      protein_g: body.protein_g ?? null,
      protein_pl_g: body.protein_pl_g ?? null,
      protein_drl_g: body.protein_drl_g ?? null,
      nitrogen_g: body.nitrogen_g ?? null,
      tryptophan_mg: body.tryptophan_mg ?? null,
      fat_g: body.fat_g ?? null,
      fatty_acids_g: body.fatty_acids_g ?? null,
      saturated_fat_g: body.saturated_fat_g ?? null,
      monounsaturated_fat_g: body.monounsaturated_fat_g ?? null,
      polyunsaturated_fat_g: body.polyunsaturated_fat_g ?? null,
      omega3_fat_g: body.omega3_fat_g ?? null,
      omega6_fat_g: body.omega6_fat_g ?? null,
      trans_fat_g: body.trans_fat_g ?? null,
      carbs_g: body.carbs_g ?? null,
      sugar_g: body.sugar_g ?? null,
      free_sugars_g: body.free_sugars_g ?? null,
      starch_g: body.starch_g ?? null,
      polyols_g: body.polyols_g ?? null,
      fiber_g: body.fiber_g ?? null,
      alcohol_g: body.alcohol_g ?? null,
      organic_acids_g: body.organic_acids_g ?? null,
      ash_g: body.ash_g ?? null,
      cholesterol_mg: body.cholesterol_mg ?? null,
      sodium_mg: body.sodium_mg ?? null,
      potassium_mg: body.potassium_mg ?? null,
      calcium_mg: body.calcium_mg ?? null,
      phosphorus_mg: body.phosphorus_mg ?? null,
      magnesium_mg: body.magnesium_mg ?? null,
      iron_mg: body.iron_mg ?? null,
      iron_haem_mg: body.iron_haem_mg ?? null,
      iron_non_haem_mg: body.iron_non_haem_mg ?? null,
      copper_mg: body.copper_mg ?? null,
      selenium_ug: body.selenium_ug ?? null,
      zinc_mg: body.zinc_mg ?? null,
      iodine_ug: body.iodine_ug ?? null,
      vit_a_rae_ug: body.vit_a_rae_ug ?? null,
      vit_a_re_ug: body.vit_a_re_ug ?? null,
      retinol_ug: body.retinol_ug ?? null,
      beta_carotene_total_ug: body.beta_carotene_total_ug ?? null,
      alpha_carotene_ug: body.alpha_carotene_ug ?? null,
      lutein_ug: body.lutein_ug ?? null,
      zeaxanthin_ug: body.zeaxanthin_ug ?? null,
      beta_cryptoxanthin_ug: body.beta_cryptoxanthin_ug ?? null,
      lycopene_ug: body.lycopene_ug ?? null,
      vit_d_ug: body.vit_d_ug ?? null,
      vit_d3_ug: body.vit_d3_ug ?? null,
      vit_d2_ug: body.vit_d2_ug ?? null,
      vit_e_mg: body.vit_e_mg ?? null,
      alpha_tocopherol_mg: body.alpha_tocopherol_mg ?? null,
      beta_tocopherol_mg: body.beta_tocopherol_mg ?? null,
      delta_tocopherol_mg: body.delta_tocopherol_mg ?? null,
      gamma_tocopherol_mg: body.gamma_tocopherol_mg ?? null,
      vit_k_ug: body.vit_k_ug ?? null,
      vit_k1_ug: body.vit_k1_ug ?? null,
      vit_k2_ug: body.vit_k2_ug ?? null,
      vit_b1_mg: body.vit_b1_mg ?? null,
      vit_b2_mg: body.vit_b2_mg ?? null,
      vit_b6_mg: body.vit_b6_mg ?? null,
      vit_b12_ug: body.vit_b12_ug ?? null,
      niacin_equiv_mg: body.niacin_equiv_mg ?? null,
      niacin_mg: body.niacin_mg ?? null,
      folate_equiv_ug: body.folate_equiv_ug ?? null,
      folate_ug: body.folate_ug ?? null,
      folic_acid_ug: body.folic_acid_ug ?? null,
      vit_c_mg: body.vit_c_mg ?? null,
    };

    const { data: newFood, error } = await supabase
      .from('custom_foods')
      .insert(row)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: error.message,
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { ...newFood, source: 'custom' as const },
    });
  } catch (error) {
    console.error('Error creating custom ingredient:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Onbekende fout',
        },
      },
      { status: 500 },
    );
  }
}
