import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * GET /api/admin/ingredients?source=nevo|custom|ai_generated|eigen|all&page=1&limit=25&search=
 * List NEVO and/or custom foods (admin only).
 * source=all returns one merged list { items, total, page, limit } (one table).
 * source=nevo returns NEVO only. source=ai_generated returns custom with created_by.
 * source=eigen returns custom without created_by (NutriCoach). source=custom returns all custom.
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
      | 'ai_generated'
      | 'eigen'
      | 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const _pageCustom = Math.max(
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
    const noCategory =
      searchParams.get('noCategory') === '1' ||
      searchParams.get('filter') === 'noCategory';

    const supabase = await createClient();

    if (source === 'nevo' && noCategory) {
      const result = await fetchNevoWithoutCategory(
        supabase,
        page,
        limit,
        search,
      );
      return NextResponse.json({ ok: true, data: result });
    }

    if (source === 'all') {
      const offset = (page - 1) * limit;
      const { data: rows, error } = await supabase.rpc(
        'get_ingredients_unified',
        {
          p_search: search || null,
          p_limit: limit,
          p_offset: offset,
        },
      );
      if (error) {
        throw error;
      }
      const list = (rows ?? []).map(
        (row: {
          total: number;
          source: 'nevo' | 'custom';
          id: string;
          nevo_code: number | null;
          name_nl: string;
          name_en: string | null;
          food_group_nl: string;
          food_group_en: string;
          energy_kcal: number | null;
          protein_g: number | null;
          fat_g: number | null;
          carbs_g: number | null;
          fiber_g: number | null;
          quantity: string | null;
          created_by: string | null;
        }) => ({
          source: row.source,
          id: row.source === 'nevo' ? parseInt(row.id, 10) : row.id,
          nevo_code: row.source === 'nevo' ? row.nevo_code! : undefined,
          name_nl: row.name_nl,
          name_en: row.name_en,
          food_group_nl: row.food_group_nl,
          food_group_en: row.food_group_en,
          energy_kcal: row.energy_kcal,
          protein_g: row.protein_g,
          fat_g: row.fat_g,
          carbs_g: row.carbs_g,
          fiber_g: row.fiber_g,
          quantity: row.quantity,
          created_by: row.source === 'custom' ? row.created_by : undefined,
        }),
      );
      const total = rows?.[0]?.total ?? 0;
      return NextResponse.json({
        ok: true,
        data: {
          items: list,
          total: Number(total),
          page,
          limit,
        },
      });
    }

    if (source === 'nevo') {
      const result = await fetchNevoList(supabase, page, limit, search);
      return NextResponse.json({ ok: true, data: result });
    }

    if (source === 'custom') {
      const result = await fetchCustomList(
        supabase,
        page,
        limit,
        search,
        'all',
      );
      return NextResponse.json({ ok: true, data: result });
    }

    if (source === 'ai_generated') {
      const result = await fetchCustomList(
        supabase,
        page,
        limit,
        search,
        'ai_only',
      );
      return NextResponse.json({ ok: true, data: result });
    }

    if (source === 'eigen') {
      const result = await fetchCustomList(
        supabase,
        page,
        limit,
        search,
        'nutricoach_only',
      );
      return NextResponse.json({ ok: true, data: result });
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'source moet nevo, custom, ai_generated, eigen of all zijn',
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

async function fetchNevoWithoutCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  page: number,
  limit: number,
  search: string,
) {
  const offset = (page - 1) * limit;
  const { data: rows, error } = await supabase.rpc(
    'get_nevo_without_category',
    {
      p_search: search || null,
      p_limit: limit,
      p_offset: offset,
    },
  );
  if (error) {
    throw error;
  }
  const total = (rows?.[0] as { total?: number } | undefined)?.total ?? 0;
  const list = (rows || []).map(
    (row: {
      total?: number;
      id: number;
      nevo_code: number;
      name_nl: string;
      name_en: string | null;
      food_group_nl: string;
      food_group_en: string;
      energy_kcal: number | null;
      protein_g: number | null;
      fat_g: number | null;
      carbs_g: number | null;
      fiber_g: number | null;
      quantity: string | null;
    }) => ({
      source: 'nevo' as const,
      id: row.id,
      nevo_code: row.nevo_code,
      name_nl: row.name_nl,
      name_en: row.name_en,
      food_group_nl: row.food_group_nl,
      food_group_en: row.food_group_en,
      energy_kcal: row.energy_kcal,
      protein_g: row.protein_g,
      fat_g: row.fat_g,
      carbs_g: row.carbs_g,
      fiber_g: row.fiber_g,
      quantity: row.quantity,
    }),
  );
  return {
    items: list,
    total: Number(total),
    page,
    limit,
  };
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

type CustomFilter = 'all' | 'ai_only' | 'nutricoach_only';

async function fetchCustomList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  page: number,
  limit: number,
  search: string,
  filter: CustomFilter = 'all',
) {
  const offset = (page - 1) * limit;
  let query = supabase
    .from('custom_foods')
    .select(
      'id, name_nl, name_en, food_group_nl, food_group_en, energy_kcal, protein_g, fat_g, carbs_g, fiber_g, quantity, created_by',
      {
        count: 'exact',
      },
    )
    .order('name_nl', { ascending: true });

  if (filter === 'ai_only') {
    query = query.not('created_by', 'is', null);
  } else if (filter === 'nutricoach_only') {
    query = query.is('created_by', null);
  }

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
