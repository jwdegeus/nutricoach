import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

/**
 * GET /api/admin/ingredients/fndds-food-groups
 * Distinct FNDDS food_group_nl from translations for dropdown (admin only).
 */
export async function GET() {
  try {
    const userIsAdmin = await isAdmin();
    if (!userIsAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Alleen admins kunnen FNDDS food groups ophalen',
          },
        },
        { status: 403 },
      );
    }

    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from('fndds_survey_food_translations')
      .select('food_group_nl')
      .not('food_group_nl', 'is', null)
      .order('food_group_nl');

    if (error) {
      throw error;
    }

    const seen = new Set<string>();
    const groups: string[] = [];
    for (const row of rows ?? []) {
      const nl = (row as { food_group_nl: string }).food_group_nl?.trim();
      if (nl && !seen.has(nl)) {
        seen.add(nl);
        groups.push(nl);
      }
    }
    groups.sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      ok: true,
      data: { groups },
    });
  } catch (error) {
    console.error('Error fetching FNDDS food groups:', error);
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
