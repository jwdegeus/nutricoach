import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

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
