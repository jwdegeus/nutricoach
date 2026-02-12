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

const ENRICH_MAX_OUTPUT_TOKENS = 8192;
const ENRICH_MAX_ROUNDS = 2;

function parseAndMergeEnrichmentResponse(
  rawJson: string,
): Record<string, string | number | null> {
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
  return correctNutritionValues(
    suggested as Record<string, unknown>,
    NUMERIC_CUSTOM_FOOD_KEYS,
  ) as Record<string, string | number | null>;
}

function buildEnrichPrompt(
  current: Record<string, string | number | null | undefined>,
  emptyKeys: string[],
): string {
  const nameNl =
    typeof current.name_nl === 'string' ? current.name_nl.trim() : '';
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
  return `Je bent een voedingskundige. Op basis van het volgende ingrediënt (eigen/custom food) stel je ontbrekende velden voor.

Huidig ingrediënt:
- name_nl: "${nameNl}"
${filledSummary ? `- Overige ingevulde velden: ${filledSummary}` : ''}

Gevraagd: vul ZOVEEL MOGELIJK van de volgende lege velden in, bij voorkeur ALLE. Gebruik uitsluitend deze sleutels, met realistische waarden per 100g:
${emptyKeys.join(', ')}

Regels:
- name_en: Engelse vertaling van de Nederlandse naam.
- food_group_nl / food_group_en: standaard NEVO-achtige groepen (bijv. "Diversen"/"Other", "Groenten en fruit", "Melk en melkproducten").
- Voedingswaarden: alleen getallen (JSON-numbers), typische waarden per 100g. sodium_mg = natrium in milligram per 100g. Andere *_mg/*_g velden: waarde in de opgegeven eenheid per 100g.
- Geef alle velden terug die je kunt invullen (geen null, geen lege strings). Hoe vollediger, hoe beter.

Antwoord uitsluitend met een geldig JSON-object, geen markdown, geen uitleg. Voorbeeld: {"name_en":"Coconut milk","food_group_nl":"Diversen","energy_kcal":230,"protein_g":2.3,"fat_g":24}`;
}

/**
 * Analyseer het huidige ingrediënt en stel suggesties voor voor lege velden
 * (vertaling naam, groep, typische voedingswaarden per 100g).
 * Voert automatisch een tweede ronde uit als er nog lege velden over zijn.
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

    let working = { ...current };
    const allSuggested: Record<string, string | number | null> = {};
    const gemini = getGeminiClient();

    for (let round = 0; round < ENRICH_MAX_ROUNDS; round++) {
      const emptyKeys = ALL_CUSTOM_FOOD_KEYS.filter((key) => {
        const v = working[key];
        return v === undefined || v === null || v === '';
      });
      if (emptyKeys.length === 0) break;

      const prompt = buildEnrichPrompt(working, emptyKeys);
      const rawJson = await gemini.generateText({
        prompt,
        temperature: 0.3,
        purpose: 'enrich',
        maxOutputTokens: ENRICH_MAX_OUTPUT_TOKENS,
      });

      const roundSuggested = parseAndMergeEnrichmentResponse(rawJson);
      for (const [key, value] of Object.entries(roundSuggested)) {
        if (value != null && !(key in allSuggested)) {
          allSuggested[key] = value;
          working = { ...working, [key]: value };
        }
      }
    }

    return { ok: true, suggested: allSuggested };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI-verrijking mislukt';
    return { ok: false, error: message };
  }
}
