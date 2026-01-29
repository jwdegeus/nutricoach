'use server';

import { createClient } from '@/src/lib/supabase/server';
import {
  searchNevoFoods,
  calculateIngredientNutrition,
  calculateCustomFoodNutrition,
  calculateRecipeNutrition,
  scaleProfile,
  calculateNutriScoreFromProfile,
  type NutritionalProfile,
  type RecipeIngredient,
  type NutriScoreGrade,
} from '@/src/lib/nevo/nutrition-calculator';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import { CustomMealsService } from '@/src/lib/custom-meals/customMeals.service';
import { quantityUnitToGrams } from '@/src/lib/recipes/quantity-unit-to-grams';
import { NUMERIC_CUSTOM_FOOD_KEYS } from '@/src/app/(app)/admin/ingredients/custom/custom-foods-fields';
import {
  correctNutritionValues,
  validateNutritionValues,
} from '@/src/app/(app)/admin/ingredients/custom/nutrition-validation';

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code:
          | 'AUTH_ERROR'
          | 'VALIDATION_ERROR'
          | 'DB_ERROR'
          | 'INTERNAL_ERROR'
          | 'AI_ERROR';
        message: string;
      };
    };

/** Normaliseer ingrediënttekst voor opslag/lookup (lowercase, trim, collapse spaces) */
function normalizeIngredientText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Haal een korte zoekterm uit een ingrediëntregel voor NEVO/custom zoeken.
 * Bijv. "794 - 907 g Kipfilet zonder botten en vel 100g (of kippendijen)" → "kipfilet".
 * Verwijderd: voorlopende getallen/eenheden, trailing "100g", haakjes.
 */
function extractIngredientSearchTerm(fullLine: string): string {
  let s = fullLine.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!s) return '';

  // Verwijder voorlopende getallen, streepjes, spaties en "g" (bijv. "794 - 907 g ")
  s = s.replace(/^[\d\s\-.,]+(g\s*)?/i, '').trim();
  // Verwijder trailing "100g", "per 100g", en haakjes met inhoud
  s = s.replace(/\s*(per\s+)?\d+\s*g\s*$/i, '').trim();
  s = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (!s) return fullLine.trim().slice(0, 50);

  // Gebruik de eerste 1–4 woorden als zoekterm (NEVO-namen zijn vaak kort: "Kipfilet", "Kip, filet")
  const words = s.split(/\s+/).filter((w) => w.length > 0);
  const take = Math.min(words.length, 4);
  const kernel = words.slice(0, take).join(' ');
  return kernel.length > 0 ? kernel : s.slice(0, 50);
}

/** Eenheden en stopwoorden die we niet als zoekterm gebruiken */
const UNIT_AND_STOP = new Set([
  'g',
  'ml',
  'el',
  'tl',
  'tl.',
  'el.',
  'st',
  'st.',
  'stuk',
  'stuks',
  'gram',
  'ml',
  'liter',
  'l',
  'kg',
  'mg',
  'mespunt',
  'snuf',
  'teentje',
  'teentjes',
  'takje',
  'takjes',
  'plak',
  'plakken',
  'eetlepel',
  'theelepel',
  'cup',
  'cups',
  'ounce',
  'oz',
  'lb',
  'pond',
  'kilo',
  'per',
  'of',
]);

/**
 * Extra zoektermen uit een zoekterm: losse woorden (zonder eenheden) en delen van samenstellingen.
 * Bijv. "kerriepoeder" → ["kerrie", "poeder"] zodat "Kerrie, poeder" in NEVO matcht.
 */
function getExtraSearchTerms(searchTerm: string): string[] {
  const terms: string[] = [];
  const words = searchTerm
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !UNIT_AND_STOP.has(w) && !/^\d+$/.test(w));

  for (const word of words) {
    // Samenstellingen: veel NEVO-namen zijn "X, y" of "Xy" (bijv. "Kerrie, poeder", "Kokosolie", "Kokosvet")
    const compoundEndings = [
      'poeder',
      'olie',
      'vet',
      'saus',
      'kruiden',
      'pasta',
      'puree',
      'sap',
      'melk',
      'room',
      'boter',
      'meel',
      'bloem',
      'azijn',
      'siroop',
      'jam',
    ];
    for (const end of compoundEndings) {
      if (word.length > end.length && word.endsWith(end)) {
        const stem = word.slice(0, -end.length);
        if (stem.length >= 2) {
          terms.push(stem);
          terms.push(end);
        }
        break;
      }
    }
  }
  return terms;
}

/**
 * Haal opgeslagen match op voor een genormaliseerde recept-ingredienttekst.
 * Wordt gebruikt om het systeem slimmer te maken: eerdere keuzes worden hergebruikt.
 */
export async function getMatchForRecipeIngredientAction(
  normalizedText: string,
): Promise<
  ActionResult<{
    source: 'nevo' | 'custom';
    nevoCode?: number;
    customFoodId?: string;
  } | null>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    const trimmed = normalizedText.trim();
    if (!trimmed) {
      return { ok: true, data: null };
    }

    const norm = normalizeIngredientText(trimmed);
    const { data, error } = await supabase
      .from('recipe_ingredient_matches')
      .select('source, nevo_code, custom_food_id')
      .eq('normalized_text', norm)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    if (!data) return { ok: true, data: null };

    return {
      ok: true,
      data: {
        source: data.source as 'nevo' | 'custom',
        nevoCode: data.nevo_code ?? undefined,
        customFoodId: data.custom_food_id ?? undefined,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      },
    };
  }
}

/** Match-resultaat voor één ingrediëntregel (voor weergave in UI) */
export type ResolvedIngredientMatch = {
  source: 'nevo' | 'custom';
  nevoCode?: number;
  customFoodId?: string;
  /** Huidige weergavenaam uit de database (custom_foods.name_nl of nevo_foods.name_nl) */
  displayName?: string;
};

/**
 * Haal voor een lijst ingrediënten de opgeslagen matches op uit recipe_ingredient_matches.
 * Per ingrediënt kunnen meerdere mogelijke regels worden geprobeerd (bijv. "olijfolie 2 el" en "olijfolie"),
 * zodat een eerder opgeslagen match uit een ander recept altijd wordt gevonden.
 */
export async function getResolvedIngredientMatchesAction(
  lineOptionsPerIngredient: string[][],
): Promise<ActionResult<(ResolvedIngredientMatch | null)[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Je moet ingelogd zijn',
        },
      };
    }

    if (
      !Array.isArray(lineOptionsPerIngredient) ||
      lineOptionsPerIngredient.length === 0
    ) {
      return { ok: true, data: [] };
    }

    const normsPerIngredient = lineOptionsPerIngredient.map((options) =>
      options
        .map((line) => normalizeIngredientText(String(line ?? '').trim()))
        .filter((n) => n.length > 0),
    );
    const uniqueNorms = [...new Set(normsPerIngredient.flat())].filter(
      (n) => n.length > 0,
    );

    if (uniqueNorms.length === 0) {
      return {
        ok: true,
        data: lineOptionsPerIngredient.map(() => null),
      };
    }

    const { data: rows, error } = await supabase
      .from('recipe_ingredient_matches')
      .select('normalized_text, source, nevo_code, custom_food_id')
      .in('normalized_text', uniqueNorms);

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    const map = new Map<
      string,
      {
        source: 'nevo' | 'custom';
        nevoCode?: number;
        customFoodId?: string;
        displayName?: string;
      }
    >();
    for (const row of rows ?? []) {
      const norm = String(row.normalized_text ?? '').trim();
      if (!norm) continue;
      map.set(norm, {
        source: row.source as 'nevo' | 'custom',
        nevoCode: row.nevo_code ?? undefined,
        customFoodId: row.custom_food_id ?? undefined,
      });
    }

    // Haal actuele weergavenamen op uit de database (na wijziging in ingredientendatabase)
    const customIds = [
      ...new Set(
        [...map.values()].flatMap((m) =>
          m.customFoodId ? [m.customFoodId] : [],
        ),
      ),
    ];
    const nevoCodes = [
      ...new Set(
        [...map.values()].flatMap((m) =>
          m.nevoCode != null ? [m.nevoCode] : [],
        ),
      ),
    ];
    const customNamesById: Record<string, string> = {};
    if (customIds.length > 0) {
      const { data: customRows } = await supabase
        .from('custom_foods')
        .select('id, name_nl')
        .in('id', customIds);
      for (const r of customRows ?? []) {
        const id = r.id as string;
        const name = (r.name_nl as string)?.trim();
        if (id && name) customNamesById[id] = name;
      }
    }
    const nevoNamesByCode: Record<number, string> = {};
    if (nevoCodes.length > 0) {
      const { data: nevoRows } = await supabase
        .from('nevo_foods')
        .select('nevo_code, name_nl')
        .in('nevo_code', nevoCodes);
      for (const r of nevoRows ?? []) {
        const code = r.nevo_code as number;
        const name = (r.name_nl as string)?.trim();
        if (code != null && name) nevoNamesByCode[code] = name;
      }
    }
    for (const match of map.values()) {
      if (match.customFoodId && customNamesById[match.customFoodId]) {
        match.displayName = customNamesById[match.customFoodId];
      } else if (
        match.nevoCode != null &&
        nevoNamesByCode[match.nevoCode] != null
      ) {
        match.displayName = nevoNamesByCode[match.nevoCode];
      }
    }

    const data = normsPerIngredient.map((norms) => {
      for (const norm of norms) {
        const match = map.get(norm);
        if (match) return match;
      }
      return null;
    });
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Haal actuele weergavenamen (name_nl) op voor custom_foods op basis van id.
 * Gebruikt bij receptweergave zodat na wijziging in de ingredientendatabase
 * de nieuwe naam in de ingredientenlijst wordt getoond.
 */
export async function getCustomFoodNamesByIdsAction(
  customFoodIds: string[],
): Promise<ActionResult<Record<string, string>>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const ids = [...new Set(customFoodIds)].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    if (ids.length === 0) {
      return { ok: true, data: {} };
    }

    const { data: rows, error } = await supabase
      .from('custom_foods')
      .select('id, name_nl')
      .in('id', ids);

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    const result: Record<string, string> = {};
    for (const r of rows ?? []) {
      const id = r.id as string;
      const name = (r.name_nl as string)?.trim();
      if (id && name) result[id] = name;
    }
    return { ok: true, data: result };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Sla een bevestigde match op (recepttekst → NEVO of custom product).
 * Wordt aangeroepen wanneer de gebruiker kiest uit "Mogelijk bedoelde u …?"
 */
export async function saveIngredientMatchAction(args: {
  normalizedText: string;
  source: 'nevo' | 'custom';
  nevoCode?: number;
  customFoodId?: string;
}): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const norm = normalizeIngredientText(args.normalizedText.trim());
    if (!norm) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'normalizedText mag niet leeg zijn',
        },
      };
    }

    if (args.source === 'nevo') {
      if (args.nevoCode == null) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'nevoCode is verplicht voor source nevo',
          },
        };
      }
      const { error } = await supabase.from('recipe_ingredient_matches').upsert(
        {
          normalized_text: norm,
          source: 'nevo',
          nevo_code: args.nevoCode,
          custom_food_id: null,
          created_by: user.id,
        },
        { onConflict: 'normalized_text' },
      );
      if (error) {
        return {
          ok: false,
          error: { code: 'DB_ERROR', message: error.message },
        };
      }
      return { ok: true, data: undefined };
    }

    if (args.source === 'custom') {
      if (!args.customFoodId) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'customFoodId is verplicht voor source custom',
          },
        };
      }
      const { error } = await supabase.from('recipe_ingredient_matches').upsert(
        {
          normalized_text: norm,
          source: 'custom',
          nevo_code: null,
          custom_food_id: args.customFoodId,
          created_by: user.id,
        },
        { onConflict: 'normalized_text' },
      );
      if (error) {
        return {
          ok: false,
          error: { code: 'DB_ERROR', message: error.message },
        };
      }
      return { ok: true, data: undefined };
    }

    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Ongeldige source' },
    };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      },
    };
  }
}

export type IngredientCandidate = {
  source: 'nevo' | 'custom';
  nevoCode?: number;
  customFoodId?: string;
  name_nl: string;
  name_en?: string | null;
  food_group_nl?: string | null;
  energy_kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  fiber_g?: number | null;
};

/** Normaliseer voor vergelijking: lowercase, spaties en komma's verwijderen (NEVO: "Olijf, olie" → "olijfolie"). */
function normalizeForMatch(s: string): string {
  return (s ?? '').toLowerCase().replace(/[,\s]+/g, '');
}

/**
 * Sorteer zoekresultaten op relevantie: exacte match, dan zoekregel bevat productnaam, dan begint met zoekterm, dan heel woord, dan substring.
 * NEVO-namen met komma (bijv. "Olijf, olie") matchen ook op genormaliseerde zoekregel "olijfolie 2 el".
 */
function sortCandidatesByRelevance(
  candidates: IngredientCandidate[],
  query: string,
): IngredientCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates;
  const qNorm = normalizeForMatch(q);

  const score = (name: string): number => {
    const n = (name ?? '').toLowerCase();
    if (n === q) return 0;
    // Zoekregel bevat productnaam (bijv. "kokosolie 2 el" bevat "kokosolie") → hoge relevantie
    if (n.length >= 2 && q.includes(n)) return 1;
    // NEVO "Olijf, olie" vs zoekregel "olijfolie 2 el": genormaliseerd bevat zoekregel de productnaam
    const nNorm = normalizeForMatch(n);
    if (nNorm.length >= 2 && qNorm.includes(nNorm)) return 1;
    if (n.startsWith(q)) return 2;
    const wordBoundary = new RegExp(
      `\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    );
    if (wordBoundary.test(n)) return 3;
    if (n.includes(q)) return 4;
    return 5;
  };

  return [...candidates].sort((a, b) => {
    const sa = score(a.name_nl);
    const sb = score(b.name_nl);
    if (sa !== sb) return sa - sb;
    return (a.name_nl ?? '').localeCompare(b.name_nl ?? '');
  });
}

/**
 * Zoek ingrediënten in NEVO + custom_foods op naam/synonym.
 * Voor uitklapmenu "Wijzig match" en voor AI-suggesties.
 * Gebruikt een verkorte zoekterm uit de ingrediëntregel (bijv. "Kipfilet" uit "794 g Kipfilet zonder botten en vel 100g").
 */
export async function searchIngredientCandidatesAction(
  query: string,
  limit: number = 15,
): Promise<ActionResult<IngredientCandidate[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const raw = query.trim();
    if (!raw) {
      return { ok: true, data: [] };
    }

    const searchTerm = extractIngredientSearchTerm(raw);
    const firstWord =
      searchTerm.indexOf(' ') > 0 ? searchTerm.split(/\s+/)[0] : '';
    const searchTerms: string[] = [searchTerm];
    if (firstWord && firstWord !== searchTerm) searchTerms.push(firstWord);
    // Extra termen uit samenstellingen (bijv. "kerriepoeder" → "kerrie", "poeder") zodat NEVO "Kerrie, poeder" matcht
    for (const t of getExtraSearchTerms(searchTerm)) {
      if (t && !searchTerms.includes(t)) searchTerms.push(t);
    }
    if (
      raw.length > searchTerm.length + 5 &&
      !searchTerms.includes(raw.slice(0, 40).trim())
    ) {
      searchTerms.push(raw.slice(0, 40).trim());
    }
    // Bij korte termen (bijv. "ui") ook meervoud zoeken voor Nederlands (ui → uien)
    if (
      searchTerm.length >= 2 &&
      searchTerm.length <= 5 &&
      !searchTerm.endsWith('en') &&
      !searchTerms.includes(searchTerm + 'en')
    ) {
      searchTerms.push(searchTerm + 'en');
    }

    const seenKeys = new Set<string>();
    const nevoCandidates: IngredientCandidate[] = [];
    const customCandidates: IngredientCandidate[] = [];

    for (const q of searchTerms) {
      if (nevoCandidates.length + customCandidates.length >= limit) break;
      const remaining = limit - nevoCandidates.length - customCandidates.length;
      if (remaining <= 0) break;

      const nevoResults = await searchNevoFoods(q, remaining);
      for (const r of nevoResults) {
        const key = `nevo:${r.nevo_code}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        nevoCandidates.push({
          source: 'nevo',
          nevoCode: r.nevo_code,
          name_nl: r.name_nl ?? '',
          name_en: r.name_en ?? null,
          food_group_nl: r.food_group_nl ?? null,
          energy_kcal: r.energy_kcal ?? null,
          protein_g: r.protein_g ?? null,
          fat_g: r.fat_g ?? null,
          carbs_g: r.carbs_g ?? null,
          fiber_g: r.fiber_g ?? null,
        });
      }

      const { data: customRows } = await supabase
        .from('custom_foods')
        .select(
          'id, name_nl, name_en, food_group_nl, energy_kcal, protein_g, fat_g, carbs_g, fiber_g',
        )
        .or(`name_nl.ilike.%${q}%,name_en.ilike.%${q}%,synonym.ilike.%${q}%`)
        .limit(remaining);

      for (const r of customRows || []) {
        const key = `custom:${r.id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        customCandidates.push({
          source: 'custom',
          customFoodId: r.id,
          name_nl: r.name_nl ?? '',
          name_en: r.name_en ?? null,
          food_group_nl: r.food_group_nl ?? null,
          energy_kcal: r.energy_kcal ?? null,
          protein_g: r.protein_g ?? null,
          fat_g: r.fat_g ?? null,
          carbs_g: r.carbs_g ?? null,
          fiber_g: r.fiber_g ?? null,
        });
      }
    }

    let combined = [...nevoCandidates, ...customCandidates].slice(0, limit);
    combined = sortCandidatesByRelevance(combined, raw);
    return { ok: true, data: combined };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Haal nutriwaardes op voor één ingrediënt (NEVO of custom) voor gegeven hoeveelheid in gram.
 * Voor uitklapmenu bij geklikte ingrediënten.
 */
export async function getIngredientNutritionAction(args: {
  source: 'nevo' | 'custom';
  nevoCode?: number;
  customFoodId?: string;
  amountG: number;
}): Promise<ActionResult<NutritionalProfile | null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const amountG = Number(args.amountG);
    if (!Number.isFinite(amountG) || amountG <= 0) {
      return {
        ok: true,
        data: null,
      };
    }

    if (args.source === 'nevo' && args.nevoCode != null) {
      const profile = await calculateIngredientNutrition(
        args.nevoCode,
        amountG,
      );
      return { ok: true, data: profile };
    }

    if (args.source === 'custom' && args.customFoodId) {
      const profile = await calculateCustomFoodNutrition(
        args.customFoodId,
        amountG,
      );
      return { ok: true, data: profile };
    }

    return { ok: true, data: null };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      },
    };
  }
}

export type RecipeNutritionSummary = {
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  totalSodium: number;
  totalG: number;
  nutriscoreGrade: NutriScoreGrade | null;
  servings: number | null;
};

/**
 * Bereken totaalvoeding en Nutri-Score voor een recept op basis van gekoppelde ingrediënten.
 * Gebruikt ingredientRefs (NEVO/custom + quantityG) of legacy ingredients + recipe_ingredient_matches.
 */
export async function getRecipeNutritionSummaryAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
}): Promise<ActionResult<RecipeNutritionSummary | null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    let mealData: Record<string, unknown> | null = null;
    let servings: number | null = null;

    if (args.source === 'custom') {
      const service = new CustomMealsService();
      const meal = await service.getMealById(args.mealId, user.id);
      if (!meal) {
        return { ok: true, data: null };
      }
      mealData = (meal.mealData as Record<string, unknown>) || {};
      const s = mealData.servings;
      if (typeof s === 'number' && s > 0) servings = s;
      else if (typeof s === 'string') {
        const n = parseInt(s, 10);
        if (!isNaN(n) && n > 0) servings = n;
      }
    } else {
      const { data, error } = await supabase
        .from('meal_history')
        .select('meal_data')
        .eq('id', args.mealId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error || !data) {
        return { ok: true, data: null };
      }
      mealData = (data.meal_data as Record<string, unknown>) || {};
      const s = mealData.servings;
      if (typeof s === 'number' && s > 0) servings = s;
      else if (typeof s === 'string') {
        const n = parseInt(s, 10);
        if (!isNaN(n) && n > 0) servings = n;
      }
    }

    if (!mealData) {
      return { ok: true, data: null };
    }

    const recipeIngredients: RecipeIngredient[] = [];

    const refs = Array.isArray(mealData.ingredientRefs)
      ? (mealData.ingredientRefs as any[])
      : [];
    if (refs.length > 0) {
      for (const ref of refs) {
        let amountG = Number(ref.quantityG ?? ref.quantity_g ?? 0);
        if (!Number.isFinite(amountG) || amountG <= 0) {
          const q = ref.quantity ?? ref.quantityG;
          const u = ref.unit ?? 'g';
          if (typeof q === 'number' && Number.isFinite(q) && u) {
            amountG = quantityUnitToGrams(q, String(u));
          }
        }
        if (!Number.isFinite(amountG) || amountG <= 0) continue;
        if (ref.customFoodId ?? ref.custom_food_id) {
          recipeIngredients.push({
            custom_food_id: ref.customFoodId ?? ref.custom_food_id,
            amount_g: amountG,
          });
        } else {
          const nevoCode =
            typeof ref.nevoCode === 'string'
              ? parseInt(ref.nevoCode, 10)
              : ref.nevoCode;
          if (Number.isFinite(nevoCode) && nevoCode > 0) {
            recipeIngredients.push({
              nevo_food_id: nevoCode,
              amount_g: amountG,
            });
          }
        }
      }
    } else {
      const ingredients = Array.isArray(mealData.ingredients)
        ? (mealData.ingredients as any[])
        : [];
      for (const ing of ingredients) {
        const line = (ing.original_line ?? ing.name ?? '')?.trim() || '';
        if (!line) continue;
        const norm = normalizeIngredientText(line);
        const { data: match } = await supabase
          .from('recipe_ingredient_matches')
          .select('source, nevo_code, custom_food_id')
          .eq('normalized_text', norm)
          .maybeSingle();

        if (!match) continue;

        const quantity = ing.quantity ?? ing.amount;
        const unit = (ing.unit ?? 'g')?.toString().trim() || 'g';
        const numQty =
          typeof quantity === 'number'
            ? quantity
            : typeof quantity === 'string'
              ? parseFloat(quantity)
              : NaN;
        const amountG =
          Number.isFinite(numQty) && numQty > 0
            ? quantityUnitToGrams(numQty, unit)
            : 0;
        if (amountG <= 0) continue;

        if (match.source === 'nevo' && match.nevo_code != null) {
          recipeIngredients.push({
            nevo_food_id: match.nevo_code,
            amount_g: amountG,
          });
        } else if (match.source === 'custom' && match.custom_food_id) {
          recipeIngredients.push({
            custom_food_id: match.custom_food_id,
            amount_g: amountG,
          });
        }
      }
    }

    if (recipeIngredients.length === 0) {
      return { ok: true, data: null };
    }

    const { profile, totalG } =
      await calculateRecipeNutrition(recipeIngredients);
    if (totalG <= 0) {
      return { ok: true, data: null };
    }

    const per100 = scaleProfile(profile, 100 / totalG);
    const nutriscoreGrade = calculateNutriScoreFromProfile(per100);

    const totalKcal = profile.energy_kcal ?? 0;
    const totalProtein = profile.protein_g ?? 0;
    const totalCarbs = profile.carbs_g ?? 0;
    const totalFat = profile.fat_g ?? 0;
    const totalFiber = profile.fiber_g ?? 0;
    const totalSodium = profile.sodium_mg ?? 0;

    return {
      ok: true,
      data: {
        totalKcal,
        totalProtein,
        totalCarbs,
        totalFat,
        totalFiber,
        totalSodium,
        totalG,
        nutriscoreGrade,
        servings,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Vervang een legacy-ingrediënt door een gematchte ref (NEVO of custom).
 * Voegt de ref toe aan ingredientRefs en verwijdert het ingrediënt op de gegeven index uit ingredients.
 */
export async function updateRecipeIngredientMatchAction(args: {
  mealId: string;
  source: 'custom' | 'gemini';
  ingredientIndex: number;
  match: {
    source: 'nevo' | 'custom';
    nevoCode?: number;
    customFoodId?: string;
  };
  displayName: string;
  /** Hoeveelheid in gram (alleen wanneer eenheid = g). Anders quantity + unit gebruiken. */
  quantityG?: number;
  /** Originele hoeveelheid uit het recept (wordt niet overschreven). */
  quantity?: number;
  /** Originele eenheid uit het recept (bijv. el, tl, ml). */
  unit?: string;
}): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const tableName =
      args.source === 'custom' ? 'custom_meals' : 'meal_history';

    const { data: current, error: fetchError } = await supabase
      .from(tableName)
      .select('meal_data')
      .eq('id', args.mealId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError || !current) {
      return {
        ok: false,
        error: {
          code: fetchError ? 'DB_ERROR' : 'VALIDATION_ERROR',
          message: fetchError?.message ?? 'Recept niet gevonden',
        },
      };
    }

    const mealData = (current.meal_data as Record<string, unknown>) || {};
    const ingredients = Array.isArray(mealData.ingredients)
      ? [...(mealData.ingredients as any[])]
      : [];
    if (
      args.ingredientIndex < 0 ||
      args.ingredientIndex >= ingredients.length
    ) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ongeldige ingrediënt-index',
        },
      };
    }

    const newRef: Record<string, unknown> = {
      displayName: args.displayName,
    };
    const unit = (args.unit ?? 'g').toLowerCase().trim();
    if (unit === 'g') {
      const qtyG = (
        typeof args.quantityG === 'number' && args.quantityG > 0
          ? args.quantityG
          : typeof args.quantity === 'number' && args.quantity > 0
            ? args.quantity
            : 0
      ) as number;
      if (qtyG > 0) newRef.quantityG = qtyG;
    } else if (
      typeof args.quantity === 'number' &&
      Number.isFinite(args.quantity) &&
      args.unit
    ) {
      newRef.quantity = args.quantity;
      newRef.unit = args.unit;
    }
    if (!newRef.quantityG && newRef.quantity == null) {
      const fallbackG =
        typeof args.quantityG === 'number' && args.quantityG > 0
          ? args.quantityG
          : 0;
      if (fallbackG > 0) newRef.quantityG = fallbackG;
    }
    if (!newRef.quantityG && newRef.quantity == null) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Geef quantityG (bij eenheid g) of quantity + unit op',
        },
      };
    }
    if (args.match.source === 'nevo' && args.match.nevoCode != null) {
      newRef.nevoCode = String(args.match.nevoCode);
    } else if (args.match.source === 'custom' && args.match.customFoodId) {
      newRef.customFoodId = args.match.customFoodId;
    } else {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Match moet nevoCode of customFoodId hebben',
        },
      };
    }

    const ingredientRefs = Array.isArray(mealData.ingredientRefs)
      ? [...(mealData.ingredientRefs as any[])]
      : [];
    ingredientRefs.push(newRef);

    const updatedIngredients = ingredients.filter(
      (_: unknown, i: number) => i !== args.ingredientIndex,
    );

    const updatedMealData = {
      ...mealData,
      ingredientRefs,
      ingredients: updatedIngredients,
    };

    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        meal_data: updatedMealData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.mealId)
      .eq('user_id', user.id);

    if (updateError) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: updateError.message },
      };
    }

    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      },
    };
  }
}

/** AI-response voor voedingswaarden per 100g (voor custom_foods insert) */
const CUSTOM_FOOD_AI_SCHEMA = {
  type: 'object',
  properties: {
    name_nl: { type: 'string' },
    food_group_nl: { type: 'string' },
    energy_kcal: { type: 'number' },
    protein_g: { type: 'number' },
    fat_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fiber_g: { type: 'number' },
    sugar_g: { type: 'number' },
    saturated_fat_g: { type: 'number' },
    sodium_mg: { type: 'number' },
  },
  required: ['name_nl'],
} as const;

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Laat AI het ingrediënt opzoeken, nutriwaardes invullen en toevoegen aan custom_foods.
 * Retourneert het nieuwe custom_food id om aan het recept te koppelen.
 */
export async function createCustomFoodFromIngredientAction(args: {
  ingredientText: string;
}): Promise<ActionResult<{ customFoodId: string; nameNl: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const text = args.ingredientText?.trim();
    if (!text) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ingrediënttekst mag niet leeg zijn',
        },
      };
    }

    const gemini = getGeminiClient();
    const prompt = `Je bent een voedingsdeskundige. Geef voor het volgende ingrediënt de geschatte voedingswaarden per 100 gram.
Gebruik betrouwbare bronnen (NEVO, USDA, wetenschappelijke waarden). Als het een bereid product is (bijv. "gekookte rijst"), geef waarden voor de bereide vorm.

Ingrediënt: "${text}"

Return een JSON object met exact deze velden (laat velden weg voor onbekende waarden):
- name_nl: Nederlandse naam van het ingrediënt (verplicht)
- food_group_nl: Voedingsgroep in het Nederlands (bijv. "Groente", "Granen", "Zuivel")
- energy_kcal: energie in kcal per 100g
- protein_g: eiwit in gram per 100g
- fat_g: totaal vet in gram per 100g
- carbs_g: koolhydraten in gram per 100g
- fiber_g: vezels in gram per 100g
- sugar_g: suiker in gram per 100g
- saturated_fat_g: verzadigd vet in gram per 100g
- sodium_mg: natrium in milligram per 100g (keukenzout ≈ 38758 mg)`;

    let jsonStr: string;
    try {
      jsonStr = await gemini.generateJson({
        prompt,
        jsonSchema: CUSTOM_FOOD_AI_SCHEMA,
        temperature: 0.2,
        purpose: 'repair',
      });
    } catch (aiErr) {
      return {
        ok: false,
        error: {
          code: 'AI_ERROR',
          message:
            aiErr instanceof Error
              ? aiErr.message
              : 'AI kon het ingrediënt niet opzoeken. Probeer het later opnieuw.',
        },
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        error: {
          code: 'AI_ERROR',
          message: 'Ongeldig antwoord van AI. Probeer het opnieuw.',
        },
      };
    }

    const nameNl = String(parsed.name_nl ?? text).trim() || text;
    const foodGroupNl =
      typeof parsed.food_group_nl === 'string' && parsed.food_group_nl.trim()
        ? parsed.food_group_nl.trim()
        : 'Overig';

    const row: Record<string, unknown> = {
      created_by: user.id,
      food_group_nl: foodGroupNl,
      food_group_en: 'Other',
      name_nl: nameNl,
      name_en: null,
      synonym: null,
      quantity: 'per 100g',
      note: null,
      energy_kcal: toNum(parsed.energy_kcal),
      protein_g: toNum(parsed.protein_g),
      fat_g: toNum(parsed.fat_g),
      carbs_g: toNum(parsed.carbs_g),
      fiber_g: toNum(parsed.fiber_g),
      sugar_g: toNum(parsed.sugar_g),
      saturated_fat_g: toNum(parsed.saturated_fat_g),
      sodium_mg: toNum(parsed.sodium_mg),
    };

    const corrected = correctNutritionValues(row, NUMERIC_CUSTOM_FOOD_KEYS);
    const validation = validateNutritionValues(
      corrected,
      NUMERIC_CUSTOM_FOOD_KEYS,
    );
    if (!validation.valid) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            validation.error ??
            'Voedingswaarden per 100g buiten plausibele grenzen. Probeer opnieuw.',
        },
      };
    }

    const { data: inserted, error } = await supabase
      .from('custom_foods')
      .insert({
        created_by: corrected.created_by,
        food_group_nl: corrected.food_group_nl,
        food_group_en: corrected.food_group_en,
        name_nl: corrected.name_nl,
        name_en: corrected.name_en,
        synonym: corrected.synonym,
        quantity: corrected.quantity,
        note: corrected.note,
        energy_kcal: corrected.energy_kcal,
        protein_g: corrected.protein_g,
        fat_g: corrected.fat_g,
        carbs_g: corrected.carbs_g,
        fiber_g: corrected.fiber_g,
        sugar_g: corrected.sugar_g,
        saturated_fat_g: corrected.saturated_fat_g,
        sodium_mg: corrected.sodium_mg,
      })
      .select('id')
      .single();

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    if (!inserted?.id) {
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Ingrediënt kon niet worden opgeslagen',
        },
      };
    }

    return {
      ok: true,
      data: { customFoodId: inserted.id, nameNl: nameNl },
    };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      },
    };
  }
}

/**
 * Voeg een eigen ingrediënt handmatig toe (custom_foods).
 * Wordt getoond wanneer AI geen geldig antwoord geeft;zelfde RLS als AI-versie (admins).
 */
export async function createCustomFoodManualAction(args: {
  name_nl: string;
  name_en?: string | null;
  food_group_nl?: string;
  food_group_en?: string;
  energy_kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  fiber_g?: number | null;
  sugar_g?: number | null;
  saturated_fat_g?: number | null;
  sodium_mg?: number | null;
}): Promise<ActionResult<{ customFoodId: string; nameNl: string }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Je moet ingelogd zijn' },
      };
    }

    const nameNl = typeof args.name_nl === 'string' ? args.name_nl.trim() : '';
    if (!nameNl) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Naam (NL) is verplicht',
        },
      };
    }

    const toNum = (v: number | null | undefined): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const { data: inserted, error } = await supabase
      .from('custom_foods')
      .insert({
        created_by: user.id,
        food_group_nl: (args.food_group_nl ?? '').trim() || 'Overig',
        food_group_en: (args.food_group_en ?? '').trim() || 'Other',
        name_nl: nameNl,
        name_en: (args.name_en ?? '').trim() || null,
        synonym: null,
        quantity: 'per 100g',
        note: null,
        energy_kcal: toNum(args.energy_kcal),
        protein_g: toNum(args.protein_g),
        fat_g: toNum(args.fat_g),
        carbs_g: toNum(args.carbs_g),
        fiber_g: toNum(args.fiber_g),
        sugar_g: toNum(args.sugar_g),
        saturated_fat_g: toNum(args.saturated_fat_g),
        sodium_mg: toNum(args.sodium_mg),
      })
      .select('id')
      .single();

    if (error) {
      return {
        ok: false,
        error: { code: 'DB_ERROR', message: error.message },
      };
    }

    if (!inserted?.id) {
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Ingrediënt kon niet worden opgeslagen',
        },
      };
    }

    return {
      ok: true,
      data: { customFoodId: inserted.id, nameNl },
    };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      },
    };
  }
}
