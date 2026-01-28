import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

/**
 * GET /api/recipes/sources
 * Get all recipe sources (system + user-created)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get all sources, ordered by usage_count desc, then by name
    const { data, error } = await supabase
      .from('recipe_sources')
      .select('id, name, is_system, usage_count')
      .order('usage_count', { ascending: false })
      .order('name', { ascending: true });

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
      data: data || [],
    });
  } catch (error) {
    console.error('Error fetching recipe sources:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'FETCH_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Onbekende fout bij ophalen bronnen',
        },
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/recipes/sources
 * Create a new recipe source (user-created)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Je moet ingelogd zijn om een bron toe te voegen',
          },
        },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Bron naam is vereist',
          },
        },
        { status: 400 },
      );
    }

    const trimmedName = name.trim();

    // Check if source already exists
    const { data: existing } = await supabase
      .from('recipe_sources')
      .select('id')
      .eq('name', trimmedName)
      .maybeSingle();

    if (existing) {
      // Source already exists, return it
      return NextResponse.json({
        ok: true,
        data: existing,
      });
    }

    // Insert new source
    const { data: newSource, error } = await supabase
      .from('recipe_sources')
      .insert({
        name: trimmedName,
        is_system: false,
        created_by_user_id: user.id,
        usage_count: 0,
      })
      .select('id, name, is_system, usage_count')
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
      data: newSource,
    });
  } catch (error) {
    console.error('Error creating recipe source:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'CREATE_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Onbekende fout bij aanmaken bron',
        },
      },
      { status: 500 },
    );
  }
}
