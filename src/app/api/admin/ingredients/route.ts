import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * GET /api/admin/ingredients?source=nevo|custom|all&page=1&limit=25&search=
 * List NEVO and/or custom foods (admin only).
 * source=all returns { nevo: { items, total }, custom: { items, total } }.
 * source=nevo or source=custom returns { items, total }.
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const source = (searchParams.get('source') || 'all') as
      | 'nevo'
      | 'custom'
      | 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageCustom = Math.max(
      1,
      parseInt(searchParams.get('pageCustom') || String(page), 10),
    );
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10),
      ),
    );
    const search = (searchParams.get('search') || '').trim();

    const supabase = await createClient();

    if (source === 'all') {
      const [nevoResult, customResult] = await Promise.all([
        fetchNevoList(supabase, page, limit, search),
        fetchCustomList(supabase, pageCustom, limit, search),
      ]);
      return NextResponse.json({
        ok: true,
        data: {
          nevo: nevoResult,
          custom: customResult,
        },
      });
    }

    if (source === 'nevo') {
      const result = await fetchNevoList(supabase, page, limit, search);
      return NextResponse.json({ ok: true, data: result });
    }

    if (source === 'custom') {
      const result = await fetchCustomList(supabase, page, limit, search);
      return NextResponse.json({ ok: true, data: result });
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'source moet nevo, custom of all zijn',
        },
      },
      { status: 400 },
    );
  } catch (error) {
    console.error('Error fetching ingredients:', error);
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

async function fetchNevoList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  page: number,
  limit: number,
  search: string,
) {
  const offset = (page - 1) * limit;
  let query = supabase
    .from('nevo_foods')
    .select(
      'id, nevo_code, name_nl, name_en, food_group_nl, food_group_en, energy_kcal, protein_g, fat_g, carbs_g, fiber_g, quantity',
      {
        count: 'exact',
      },
    )
    .order('name_nl', { ascending: true });

  if (search) {
    query = query.or(`name_nl.ilike.%${search}%,name_en.ilike.%${search}%`);
  }

  const {
    data: items,
    error,
    count,
  } = await query.range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }

  const list = (items || []).map((row) => ({
    ...row,
    source: 'nevo' as const,
  }));

  return {
    items: list,
    total: count ?? 0,
    page,
    limit,
  };
}

async function fetchCustomList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  page: number,
  limit: number,
  search: string,
) {
  const offset = (page - 1) * limit;
  let query = supabase
    .from('custom_foods')
    .select(
      'id, name_nl, name_en, food_group_nl, food_group_en, energy_kcal, protein_g, fat_g, carbs_g, fiber_g, quantity',
      {
        count: 'exact',
      },
    )
    .order('name_nl', { ascending: true });

  if (search) {
    query = query.or(`name_nl.ilike.%${search}%,name_en.ilike.%${search}%`);
  }

  const {
    data: items,
    error,
    count,
  } = await query.range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }

  const list = (items || []).map((row) => ({
    ...row,
    source: 'custom' as const,
  }));

  return {
    items: list,
    total: count ?? 0,
    page,
    limit,
  };
}
