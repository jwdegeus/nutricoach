import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { storageService } from '@/src/lib/storage/storage.service';
import { generateRecipeImage } from '@/src/lib/ai/gemini/gemini-image.client';

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
            message: 'Je moet ingelogd zijn om een afbeelding te genereren',
          },
        },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { mealId, source, recipeName, recipeSummary, recipeDishType } = body;

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

    const name = String(recipeName || '').trim() || 'Recept';
    const summary = String(recipeSummary || '').trim();
    const dishType = String(recipeDishType || '')
      .trim()
      .toLowerCase();

    // Presentation hint based on dish type so the model shows the right vessel (e.g. smoothie in glass, not bowl)
    const presentationHint = (() => {
      if (!dishType) return '';
      const drinkLike =
        /smoothie|smoothies|shake|drink|sap|sapje|juice|milkshake|frappé/i.test(
          dishType,
        );
      const soupLike = /soep|soup|bouillon/i.test(dishType);
      if (drinkLike)
        return ' The dish is a drink or smoothie: show it in a tall glass or tumbler, not in a bowl.';
      if (soupLike)
        return ' The dish is a soup: show it in a bowl or soup plate.';
      return ` Present as appropriate for this type of dish: "${dishType}".`;
    })();

    const contextPart = summary ? ` Context: ${summary}.` : '';
    const prompt = `Generate a single appetizing, photorealistic food photograph for this recipe. Style: professional food photography, natural lighting, clean presentation. Recipe: "${name}".${contextPart}${presentationHint} Output one image only, no text.`;

    const result = await generateRecipeImage(prompt);
    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'GENERATION_ERROR',
            message: 'Geen afbeelding gegenereerd; probeer het opnieuw.',
          },
        },
        { status: 502 },
      );
    }

    const useBlob =
      typeof process.env.BLOB_READ_WRITE_TOKEN === 'string' &&
      process.env.BLOB_READ_WRITE_TOKEN.length > 0;
    const filename = `recipe-ai-${Date.now()}.png`;
    const uploadResult = useBlob
      ? await storageService.uploadImageToBlob(
          result.dataBase64,
          filename,
          user.id,
        )
      : await storageService.uploadImage(result.dataBase64, filename, user.id);

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
    }

    return NextResponse.json({
      ok: true,
      data: {
        url: uploadResult.url,
        path: uploadResult.path,
      },
    });
  } catch (error) {
    console.error('Error generating recipe image:', error);
    const message =
      error instanceof Error ? error.message : 'Onbekende fout bij genereren';
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'GENERATION_ERROR',
          message:
            message.includes('GEMINI') || message.includes('API')
              ? message
              : 'Genereren mislukt. Controleer GEMINI_IMAGE_API_KEY en GEMINI_MODEL_IMAGE in .env.local.',
        },
      },
      { status: 500 },
    );
  }
}
