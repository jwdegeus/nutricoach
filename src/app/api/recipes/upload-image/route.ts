import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { storageService } from '@/src/lib/storage/storage.service';

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
            message: 'Je moet ingelogd zijn om afbeeldingen te uploaden',
          },
        },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { mealId, source, imageData, filename } = body;

    if (!mealId || !source || !imageData) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Meal ID, source en afbeelding zijn vereist',
          },
        },
        { status: 400 },
      );
    }

    // Extract base64 data
    const base64Match = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ongeldig afbeelding formaat',
          },
        },
        { status: 400 },
      );
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];

    // Upload to storage
    const uploadResult = await storageService.uploadImage(
      base64Data,
      filename || 'recipe-image.jpg',
      user.id,
    );

    // Update meal record
    if (source === 'custom') {
      const { error } = await supabase
        .from('custom_meals')
        .update({
          source_image_url: uploadResult.url,
          source_image_path: uploadResult.path,
        })
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
      // For meal_history, we could add a result_image_url field or use notes
      // For now, we'll just return success but not store it in meal_history
      // (since meal_history doesn't have source_image_url)
      // You might want to add a result_image_url field to meal_history in the future
    }

    return NextResponse.json({
      ok: true,
      data: {
        url: uploadResult.url,
        path: uploadResult.path,
      },
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'UPLOAD_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Onbekende fout bij uploaden',
        },
      },
      { status: 500 },
    );
  }
}
