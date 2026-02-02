import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

const VALID_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

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
            message: 'Je moet ingelogd zijn om maaltijdmoment bij te werken',
          },
        },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { mealId, source, mealSlot } = body;

    if (!mealId || !source || !mealSlot) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Meal ID, source en maaltijdmoment zijn vereist',
          },
        },
        { status: 400 },
      );
    }

    if (!VALID_SLOTS.includes(mealSlot)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Ongeldig maaltijdmoment. Kies uit: ${VALID_SLOTS.join(', ')}`,
          },
        },
        { status: 400 },
      );
    }

    if (source === 'custom') {
      const { error } = await supabase
        .from('custom_meals')
        .update({ meal_slot: mealSlot })
        .eq('id', mealId)
        .eq('user_id', user.id);

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
    } else {
      const { error } = await supabase
        .from('meal_history')
        .update({ meal_slot: mealSlot })
        .eq('id', mealId)
        .eq('user_id', user.id);

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
    }

    return NextResponse.json({
      ok: true,
      data: { message: 'Maaltijdmoment bijgewerkt', mealSlot },
    });
  } catch (error) {
    console.error('Error updating meal slot:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UPDATE_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Onbekende fout bij bijwerken',
        },
      },
      { status: 500 },
    );
  }
}
