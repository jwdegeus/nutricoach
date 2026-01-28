import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

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
            message: 'Je moet ingelogd zijn om afbeeldingen te verwijderen',
          },
        },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { mealId, source } = body;

    if (!mealId || !source) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Meal ID en source zijn vereist',
          },
        },
        { status: 400 },
      );
    }

    // Get current image path from database
    if (source === 'custom') {
      const { data: meal, error: fetchError } = await supabase
        .from('custom_meals')
        .select('source_image_url, source_image_path')
        .eq('id', mealId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'DB_ERROR',
              message: fetchError.message,
            },
          },
          { status: 500 },
        );
      }

      if (!meal) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Recept niet gevonden',
            },
          },
          { status: 404 },
        );
      }

      // Delete file from filesystem if it exists
      if (meal.source_image_path && existsSync(meal.source_image_path)) {
        try {
          await unlink(meal.source_image_path);
        } catch (unlinkError) {
          // Log error but don't fail the request if file doesn't exist
          console.warn('Failed to delete file:', unlinkError);
        }
      }

      // Update database to remove image references
      const { error: updateError } = await supabase
        .from('custom_meals')
        .update({
          source_image_url: null,
          source_image_path: null,
        })
        .eq('id', mealId)
        .eq('user_id', user.id);

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'DB_ERROR',
              message: updateError.message,
            },
          },
          { status: 500 },
        );
      }
    } else {
      // For meal_history, we don't store images currently
      // But we could add this in the future
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'NOT_IMPLEMENTED',
            message:
              'Verwijderen van afbeeldingen voor Gemini recepten is nog niet geïmplementeerd',
          },
        },
        { status: 501 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { message: 'Afbeelding verwijderd' },
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'DELETE_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Onbekende fout bij verwijderen',
        },
      },
      { status: 500 },
    );
  }
}
