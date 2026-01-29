'use server';

import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import {
  ALL_CUSTOM_FOOD_KEYS,
  NUMERIC_CUSTOM_FOOD_KEYS,
} from '../custom-foods-fields';
import { correctNutritionValues } from '../nutrition-validation';

/**
 * Parse een getal uit AI-output. Punt = decimaal (38.758 = 38,758 mg).
 * Komma wordt als decimaal behandeld (1,5 → 1.5).
 */
function parseNumericEnrichmentString(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

export type EnrichIngredientResult =
  | { ok: true; suggested: Record<string, string | number | null> }
  | { ok: false; error: string };

/**
 * Analyseer het huidige ingrediënt en stel suggesties voor voor lege velden
 * (vertaling naam, groep, typische voedingswaarden per 100g).
 * Alleen velden die nu leeg zijn worden voorgesteld.
 */
export async function suggestIngredientEnrichmentAction(
  current: Record<string, string | number | null | undefined>,
): Promise<EnrichIngredientResult> {
  try {
    const nameNl =
      typeof current.name_nl === 'string' ? current.name_nl.trim() : '';
    if (!nameNl) {
      return {
        ok: false,
        error: 'Naam (NL) is verplicht om verrijking te suggereren',
      };
    }

    const emptyKeys = ALL_CUSTOM_FOOD_KEYS.filter((key) => {
      const v = current[key];
      return v === undefined || v === null || v === '';
    });
    if (emptyKeys.length === 0) {
      return { ok: true, suggested: {} };
    }

    const filledSummary = Object.entries(current)
      .filter(
        ([k, v]) =>
          ALL_CUSTOM_FOOD_KEYS.includes(k) &&
          v !== undefined &&
          v !== null &&
          v !== '',
      )
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    const prompt = `Je bent een voedingskundige. Op basis van het volgende ingrediënt (eigen/custom food) stel je ontbrekende velden voor.

Huidig ingrediënt:
- name_nl: "${nameNl}"
${filledSummary ? `- Overige ingevulde velden: ${filledSummary}` : ''}

Gevraagd: vul ALLEEN velden in die nu leeg zijn. Gebruik uitsluitend de volgende sleutels (zelfde als in de database), met realistische waarden per 100g waar van toepassing:
${emptyKeys.join(', ')}

Regels:
- name_en: Engelse vertaling van de Nederlandse naam als die ontbreekt.
- food_group_nl / food_group_en: standaard NEVO-achtige groepen (bijv. "Diversen"/"Other", "Groenten en fruit", "Melk en melkproducten").
- Voedingswaarden: alleen getallen (JSON-numbers), typische waarden per 100g. sodium_mg = natrium in milligram per 100g (keukenzout ≈ 38758 mg). Andere *_mg/*_g velden: waarde in de opgegeven eenheid per 100g.
- Geef alleen velden terug die je wilt voorstellen (geen null, geen lege strings).

Antwoord uitsluitend met een geldig JSON-object, geen markdown, geen uitleg. Voorbeeld: {"name_en":"Coconut milk","food_group_nl":"Diversen","energy_kcal":230}`;

    const gemini = getGeminiClient();
    const rawJson = await gemini.generateText({
      prompt,
      temperature: 0.3,
      purpose: 'enrich',
    });

    const trimmed = rawJson.trim().replace(/^```json\s*|\s*```$/g, '');
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const suggested: Record<string, string | number | null> = {};
    for (const key of ALL_CUSTOM_FOOD_KEYS) {
      if (!(key in parsed)) continue;
      const v = parsed[key];
      if (v === undefined || v === null) continue;
      if (typeof v === 'number' && Number.isFinite(v)) {
        suggested[key] = v;
      } else if (typeof v === 'string' && v.trim() !== '') {
        if (NUMERIC_CUSTOM_FOOD_KEYS.has(key)) {
          const num = parseNumericEnrichmentString(v);
          if (num !== null) suggested[key] = num;
        } else {
          suggested[key] = v.trim();
        }
      }
    }
    // Corrigeer veelvoorkomende AI-fout: waarde in verkeerde schaal (bijv. 38758 → 38.758 voor sodium_mg)
    const corrected = correctNutritionValues(
      suggested as Record<string, unknown>,
      NUMERIC_CUSTOM_FOOD_KEYS,
    ) as Record<string, string | number | null>;
    return { ok: true, suggested: corrected };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI-verrijking mislukt';
    return { ok: false, error: message };
  }
}
