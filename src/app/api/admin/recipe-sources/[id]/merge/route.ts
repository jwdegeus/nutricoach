import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

/**
 * POST /api/admin/recipe-sources/[id]/merge
 * Merge a recipe source into another (admin only)
 * This updates all meals using the source to use the target source instead
 */
export async function POST(
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
            message: 'Alleen admins kunnen bronnen samenvoegen',
          },
        },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { targetSourceId } = body;

    if (!id || !targetSourceId) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'ID en doelbron ID zijn vereist',
          },
        },
        { status: 400 },
      );
    }

    if (id === targetSourceId) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Je kunt een bron niet met zichzelf samenvoegen',
          },
        },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // Get source names
    const { data: source } = await supabase
      .from('recipe_sources')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();

    const { data: targetSource } = await supabase
      .from('recipe_sources')
      .select('id, name, usage_count')
      .eq('id', targetSourceId)
      .maybeSingle();

    if (!source || !targetSource) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Bron of doelbron niet gevonden',
          },
        },
        { status: 404 },
      );
    }

    // Update all custom_meals using this source
    const { error: customMealsError } = await supabase
      .from('custom_meals')
      .update({ source: targetSource.name })
      .eq('source', source.name);

    if (customMealsError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: `Fout bij bijwerken custom_meals: ${customMealsError.message}`,
          },
        },
        { status: 500 },
      );
    }

    // Update all meal_history using this source
    const { error: mealHistoryError } = await supabase
      .from('meal_history')
      .update({ source: targetSource.name })
      .eq('source', source.name);

    if (mealHistoryError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'DB_ERROR',
            message: `Fout bij bijwerken meal_history: ${mealHistoryError.message}`,
          },
        },
        { status: 500 },
      );
    }

    // Get count of records that were updated (before update, they had source.name)
    // We need to count how many were updated, so we'll do a query after the update
    const { count: customMealsCount } = await supabase
      .from('custom_meals')
      .select('*', { count: 'exact', head: true })
      .eq('source', targetSource.name);

    const { count: mealHistoryCount } = await supabase
      .from('meal_history')
      .select('*', { count: 'exact', head: true })
      .eq('source', targetSource.name);

    // Update usage_count for target source (add the merged count)
    const mergedCount = (customMealsCount || 0) + (mealHistoryCount || 0);
    const newUsageCount = (targetSource.usage_count || 0) + mergedCount;
    await supabase
      .from('recipe_sources')
      .update({ usage_count: newUsageCount })
      .eq('id', targetSourceId);

    // Delete the merged source
    await supabase.from('recipe_sources').delete().eq('id', id);

    return NextResponse.json({
      ok: true,
      data: {
        message: 'Bronnen samengevoegd',
        updatedCount: (customMealsCount || 0) + (mealHistoryCount || 0),
      },
    });
  } catch (error) {
    console.error('Error merging recipe sources:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'MERGE_ERROR',
          message: error instanceof Error ? error.message : 'Onbekende fout',
        },
      },
      { status: 500 },
    );
  }
}
