/**
 * FNDDS Survey Food display-name resolver (nl-NL).
 * Server-only: resolves display name from translations or falls back to source description.
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';

export type FnddsTranslationStatus = 'untranslated' | 'machine' | 'reviewed';

export type FnddsDisplayNameResult = {
  fdcId: number;
  locale: string;
  name: string;
  status: FnddsTranslationStatus;
};

/**
 * Resolve display name for an FNDDS survey food.
 * If a translation exists for (fdcId, locale), returns it; otherwise falls back to
 * fndds_survey_foods.description with status 'untranslated'.
 */
export async function resolveFnddsSurveyDisplayName(
  fdcId: number,
  locale: string = 'nl-NL',
): Promise<FnddsDisplayNameResult> {
  const supabase = await createClient();

  const { data: translation } = await supabase
    .from('fndds_survey_food_translations')
    .select('display_name, status')
    .eq('fdc_id', fdcId)
    .eq('locale', locale)
    .maybeSingle();

  if (translation?.display_name != null) {
    return {
      fdcId,
      locale,
      name: translation.display_name,
      status: (translation.status as FnddsTranslationStatus) ?? 'machine',
    };
  }

  const { data: food } = await supabase
    .from('fndds_survey_foods')
    .select('description')
    .eq('fdc_id', fdcId)
    .maybeSingle();

  return {
    fdcId,
    locale,
    name: food?.description ?? String(fdcId),
    status: 'untranslated',
  };
}
