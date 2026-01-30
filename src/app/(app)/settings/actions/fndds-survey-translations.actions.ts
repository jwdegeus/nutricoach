'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import type { ActionResult } from '@/src/lib/types';
import type { FnddsTranslationStatus } from '@/src/lib/fndds/fnddsSurveyTranslations';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';

export type UpsertFnddsSurveyTranslationInput = {
  fdcId: number;
  locale?: string;
  displayName: string;
  synonyms?: string[];
  status?: FnddsTranslationStatus;
};

/**
 * Upsert a translation for an FNDDS survey food.
 * Idempotent on (fdc_id, locale). Admin only.
 */
export async function upsertFnddsSurveyTranslationAction(
  input: UpsertFnddsSurveyTranslationInput,
): Promise<ActionResult<{ fdcId: number; locale: string }>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Alleen admins kunnen FNDDS-vertalingen beheren' };
  }

  const displayName = input.displayName?.trim();
  if (!displayName) {
    return { error: 'displayName is verplicht' };
  }

  const locale = input.locale?.trim() || 'nl-NL';
  const status = input.status ?? 'machine';
  const validStatuses: FnddsTranslationStatus[] = [
    'untranslated',
    'machine',
    'reviewed',
  ];
  if (!validStatuses.includes(status)) {
    return { error: `status moet een van ${validStatuses.join(', ')} zijn` };
  }

  const synonyms =
    input.synonyms != null && Array.isArray(input.synonyms)
      ? input.synonyms.filter((s) => typeof s === 'string')
      : null;

  const supabase = await createClient();

  const { error } = await supabase
    .from('fndds_survey_food_translations')
    .upsert(
      {
        fdc_id: input.fdcId,
        locale,
        display_name: displayName,
        synonyms: synonyms ?? undefined,
        status,
      },
      { onConflict: 'fdc_id,locale' },
    );

  if (error) {
    return { error: `Fout bij opslaan vertaling: ${error.message}` };
  }

  return { data: { fdcId: input.fdcId, locale } };
}

const FNDDS_LOCALE = 'nl-NL';

export type TranslateFnddsToDutchResult = {
  translated: number;
  failed: number;
  errors: string[];
};

/**
 * Translate FNDDS survey food names (EN → NL) for items that don't have a nl-NL translation yet.
 * Uses Gemini (translate model). Admin only. Processes up to `limit` items per call (default 25).
 */
export async function translateFnddsToDutchBatchAction(options?: {
  limit?: number;
}): Promise<ActionResult<TranslateFnddsToDutchResult>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Alleen admins kunnen FNDDS vertalen' };
  }

  const batchSize = Math.min(Math.max(options?.limit ?? 25, 1), 100);

  const supabase = await createClient();

  const { data: translatedIds } = await supabase
    .from('fndds_survey_food_translations')
    .select('fdc_id')
    .eq('locale', FNDDS_LOCALE);
  const hasTranslation = new Set((translatedIds ?? []).map((r) => r.fdc_id));

  const { data: foods } = await supabase
    .from('fndds_survey_foods')
    .select('fdc_id, description')
    .order('fdc_id', { ascending: true })
    .limit(3000);

  const toTranslate = (foods ?? [])
    .filter((f) => !hasTranslation.has(f.fdc_id))
    .slice(0, batchSize);

  if (toTranslate.length === 0) {
    return {
      data: { translated: 0, failed: 0, errors: [] },
    };
  }

  const gemini = getGeminiClient();
  const errors: string[] = [];
  let translatedCount = 0;

  for (const food of toTranslate) {
    const description = food.description?.trim() || String(food.fdc_id);
    const prompt = `Vertaal deze voedingsmiddelnaam naar het Nederlands. Geef alleen de Nederlandse naam, geen uitleg of Engels.

"${description}"

Nederlandse naam:`;

    try {
      const response = await gemini.generateText({
        prompt,
        temperature: 0.2,
        purpose: 'translate',
      });
      const displayName =
        response
          .trim()
          .replace(/^["']|["']$/g, '')
          .trim() || description;

      const { error } = await supabase
        .from('fndds_survey_food_translations')
        .upsert(
          {
            fdc_id: food.fdc_id,
            locale: FNDDS_LOCALE,
            display_name: displayName,
            status: 'machine',
          },
          { onConflict: 'fdc_id,locale' },
        );

      if (error) {
        errors.push(`fdc_id ${food.fdc_id}: ${error.message}`);
      } else {
        translatedCount++;
      }
    } catch (e) {
      errors.push(
        `fdc_id ${food.fdc_id}: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
    }
  }

  return {
    data: {
      translated: translatedCount,
      failed: toTranslate.length - translatedCount,
      errors,
    },
  };
}
