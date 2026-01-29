import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

/**
 * GET /api/admin/ingredients/food-groups
 * Distinct NEVO food groups (nl, en) for single-select dropdown (admin only).
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
            message: 'Alleen admins kunnen food groups ophalen',
          },
        },
        { status: 403 },
      );
    }

    const supabase = await createClient();
    const { data: rows, error } = await supabase.rpc('get_nevo_food_groups');

    if (error) {
      throw error;
    }

    const groups: { nl: string; en: string }[] = (rows ?? []).map(
      (row: {
        food_group_nl: string | null;
        food_group_en: string | null;
      }) => ({
        nl: row.food_group_nl ?? '',
        en: row.food_group_en ?? row.food_group_nl ?? '',
      }),
    );

    return NextResponse.json({
      ok: true,
      data: { groups },
    });
  } catch (error) {
    console.error('Error fetching food groups:', error);
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
