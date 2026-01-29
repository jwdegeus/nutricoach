import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

/**
 * GET /api/admin/ingredients/nevo/[id]
 * Get single NEVO food by id (admin only).
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

    const id = parseInt((await params).id, 10);
    if (Number.isNaN(id)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ongeldig NEVO id',
          },
        },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('nevo_foods')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'NEVO-ingrediënt niet gevonden',
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { ...data, source: 'nevo' as const },
    });
  } catch (error) {
    console.error('Error fetching NEVO ingredient:', error);
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
