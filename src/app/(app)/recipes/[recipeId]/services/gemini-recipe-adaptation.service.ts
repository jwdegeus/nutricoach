/**
 * Gemini Recipe Adaptation Service
 *
 * Uses Gemini AI as the "chef" that adapts recipes using the diet rules ("wetboeken").
 * Returns structured output: intro, adapted ingredients with notes, full adapted steps,
 * and "why this works" bullets for the UI.
 */

import 'server-only';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import type {
  RecipeAdaptationDraft,
  ViolationDetail,
} from '../recipe-ai.types';
import type { DietRuleset } from './diet-validator';

const AI_SUGGESTION_MIN_CONFIDENCE = 0.7;

/**
 * Haalt JSON uit een response die voorafgegaan wordt door tekst (bijv. "Hier is het aangepaste recept:\n\n{...}").
 */
function extractJsonFromResponse(raw: string): string {
  const s = raw.trim();
  const jsonBlock = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlock) {
    return jsonBlock[1].trim();
  }
  const start = s.indexOf('{');
  if (start === -1) return s;
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote: string | null = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.slice(start);
}

export type RecipeData = {
  mealData: Record<string, unknown>;
  mealName: string;
  steps: string[];
};

/** Optioneel: ingrediënten die de gebruiker wil schrappen (niet opnemen in het recept). */
export type GeminiAdaptationOptions = {
  ingredientsToRemove?: string[];
};

/**
 * JSON-schema voor structured output (responseMimeType: application/json).
 * Komt overeen met GeminiRecipeAdaptationResponse in recipe-ai.types.ts.
 */
const ADAPTATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intro: {
      type: 'string',
      description:
        'Korte introductie in het Nederlands (bv. "Om dit recept Wahls Paleo proof te maken...")',
    },
    adapted_ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Ingrediëntnaam' },
          amount: {
            type: 'string',
            description: 'Hoeveelheid (bv. "4", "1/2", "250")',
          },
          unit: {
            type: 'string',
            description: 'Eenheid (bv. "stuks", "ml", "gram")',
          },
          note: {
            type: 'string',
            description:
              'Optionele toelichting (bv. "Vervanging voor rijst", "Telt mee voor bladgroen")',
          },
        },
        required: ['name', 'amount', 'unit', 'note'],
      },
    },
    adapted_steps: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Bereidingsstappen volledig herschreven voor de nieuwe ingrediënten',
    },
    why_this_works: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Bullets met gezondheidsvoordelen binnen dit dieet (bv. "Geen granen", "Extra bladgroen")',
    },
  },
  required: ['intro', 'adapted_ingredients', 'adapted_steps', 'why_this_works'],
};

/**
 * Generate recipe adaptation using Gemini AI (structured output).
 *
 * Gemini fungeert als chef met de dieetregels als wetboek: volledige herschrijving
 * van ingrediënten en stappen, plus intro en "waarom dit werkt".
 */
export async function generateRecipeAdaptationWithGemini(
  recipe: RecipeData,
  violations: ViolationDetail[],
  ruleset: DietRuleset,
  dietName: string,
  options?: GeminiAdaptationOptions,
): Promise<RecipeAdaptationDraft> {
  const gemini = getGeminiClient();
  const prompt = buildAdaptationPrompt(
    recipe,
    violations,
    ruleset,
    dietName,
    options?.ingredientsToRemove ?? [],
  );

  try {
    console.log(
      '[GeminiRecipeAdaptation] Calling Gemini for recipe adaptation (structured output)...',
    );
    const startTime = Date.now();

    const rawResponse = await gemini.generateJson({
      prompt,
      jsonSchema: ADAPTATION_JSON_SCHEMA,
      temperature: 0.4,
      purpose: 'repair',
      maxOutputTokens: 8192,
    });

    const duration = Date.now() - startTime;
    console.log(
      `[GeminiRecipeAdaptation] Gemini API call completed in ${duration}ms`,
    );

    let parsed: unknown;
    try {
      const jsonStr = extractJsonFromResponse(rawResponse);
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error(
        '[GeminiRecipeAdaptation] Failed to parse JSON:',
        parseError,
      );
      console.error(
        '[GeminiRecipeAdaptation] Raw response (first 400 chars):',
        rawResponse.slice(0, 400),
      );
      throw new Error('Invalid JSON response from Gemini');
    }

    type GeminiDraft = {
      intro?: string;
      adapted_ingredients?: Array<{
        name: string;
        amount: string;
        unit: string;
        note: string;
      }>;
      adapted_steps?: string[];
      why_this_works?: string[];
    };
    return convertGeminiResponseToDraft(
      parsed as GeminiDraft,
      recipe,
      violations,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[GeminiRecipeAdaptation] Error:', msg);
    if (stack) console.error('[GeminiRecipeAdaptation] Stack:', stack);
    throw new Error(`Gemini recipe adaptation failed: ${msg}`);
  }
}

/**
 * System instruction: chef met wetboeken.
 * [DIEETREGELS] wordt vervangen door de geformatteerde regels uit ruleset + violations.
 */
const SYSTEM_INSTRUCTION = `Je bent een culinaire expert gespecialiseerd in therapeutische diëten zoals Wahls Paleo, Keto en Auto-immuun Paleo.

**Jouw taak:** Transformeer het aangeboden recept op basis van de meegeleverde [DIEETREGELS].

**Strikte richtlijnen:**
1. Gebruik ALTIJD de verplichte substituties uit de [DIEETREGELS] voor verboden ingrediënten.
2. Herschrijf de bereidingsstappen VOLLEDIG zodat ze logisch zijn voor de nieuwe ingrediënten (bijv. kortere kooktijd voor bloemkoolrijst vs. gewone rijst).
3. Voeg een 'why_this_works' sectie toe die specifiek de gezondheidsvoordelen binnen dit dieet benoemt.
4. De output MOET in het Nederlands zijn en strikt voldoen aan het gevraagde JSON schema.`;

/**
 * Build prompt: system instruction + [DIEETREGELS] + recept + eventueel schraplijst.
 */
function buildAdaptationPrompt(
  recipe: RecipeData,
  violations: ViolationDetail[],
  ruleset: DietRuleset,
  dietName: string,
  ingredientsToRemove: string[],
): string {
  const ingredients = Array.isArray(recipe.mealData?.ingredientRefs)
    ? recipe.mealData.ingredientRefs
    : Array.isArray(recipe.mealData?.ingredients)
      ? recipe.mealData.ingredients
      : [];
  type IngLike = {
    displayName?: string;
    name?: string;
    original_line?: string;
    quantityG?: unknown;
    quantity?: unknown;
    amount?: unknown;
    unit?: string;
  };
  const ingredientList = ingredients
    .filter((ing): ing is IngLike => ing != null)
    .map((ing: IngLike) => {
      const name =
        ing?.displayName ||
        ing?.name ||
        ing?.original_line ||
        String(ing ?? '');
      const quantity = ing?.quantityG ?? ing?.quantity ?? ing?.amount ?? '';
      const unit = ing?.unit ?? '';
      return `${quantity} ${unit} ${name}`.trim();
    })
    .join('\n');

  const stepsList = recipe.steps
    .map(
      (step, index) =>
        `${index + 1}. ${typeof step === 'string' ? step : String(step)}`,
    )
    .join('\n');

  // [DIEETREGELS]: verboden termen + per violation de regel en voorgestelde vervanging
  const dieetregelsLines = [
    `Dieet: ${dietName}`,
    '',
    'Verboden / beperkt (uit dieetregels):',
    ...ruleset.forbidden.map(
      (r) =>
        `- ${r.term}${r.synonyms?.length ? ` (${r.synonyms.slice(0, 3).join(', ')})` : ''}: ${r.ruleLabel}. Vervanging: ${(r.substitutionSuggestions ?? []).slice(0, 3).join(', ') || 'geen opgegeven'}`,
    ),
    '',
    'Gedetecteerde afwijkingen in dit recept (deze MOETEN worden aangepast):',
    ...violations.map(
      (v) =>
        `- "${v.ingredientName}" | Regel: ${v.ruleLabel} | Voorgestelde vervanging: ${v.suggestion}`,
    ),
  ];
  const dieetregelsBlock = dieetregelsLines.join('\n');

  let promptText = `${SYSTEM_INSTRUCTION.replace('[DIEETREGELS]', dieetregelsBlock)}

---

RECEPT:
Naam: ${recipe.mealName}

Ingrediënten:
${ingredientList}

Bereidingswijze:
${stepsList}`;

  if (ingredientsToRemove.length > 0) {
    promptText += `

SCHRAPPEN: De gebruiker wil de volgende ingrediënten niet in het recept. Neem ze NIET op in adapted_ingredients en noem ze niet in de stappen:
${ingredientsToRemove.map((n) => `- ${n}`).join('\n')}`;
  }

  promptText += `

Geef je antwoord ALLEEN als een geldig JSON-object met de velden: intro, adapted_ingredients, adapted_steps, why_this_works. Geen tekst voor of na de JSON.`;

  return promptText;
}

/**
 * Map Gemini structured response to RecipeAdaptationDraft.
 * - intro en why_this_works komen direct in rewrite
 * - adapted_ingredients: amount → quantity, rest 1:1
 * - adapted_steps: string[] → steps: { step: index+1, text }
 */
function convertGeminiResponseToDraft(
  geminiResponse: {
    intro?: string;
    adapted_ingredients?: Array<{
      name: string;
      amount: string;
      unit: string;
      note: string;
    }>;
    adapted_steps?: string[];
    why_this_works?: string[];
  },
  recipe: RecipeData,
  violations: ViolationDetail[],
): RecipeAdaptationDraft {
  const ingredients = (geminiResponse.adapted_ingredients ?? []).map((ing) => ({
    name: ing.name ?? '',
    quantity: String(ing.amount ?? '').trim(),
    unit: (ing.unit ?? '').trim() || undefined,
    note: (ing.note ?? '').trim() || undefined,
  }));

  const steps = (geminiResponse.adapted_steps ?? []).map((text, index) => ({
    step: index + 1,
    text: String(text ?? '').trim(),
  }));

  const summary =
    violations.length === 0
      ? 'Geen afwijkingen gevonden! Dit recept past perfect bij jouw dieet.'
      : `${violations.length} ingrediënt${violations.length !== 1 ? 'en' : ''} aangepast voor jouw dieet. Hieronder vind je de aangepaste versie met alternatieven en verbeterde bereidingswijze.`;

  return {
    analysis: {
      violations,
      summary,
    },
    rewrite: {
      title: `Aangepast: ${recipe.mealName}`,
      ingredients,
      steps,
      intro: (geminiResponse.intro ?? '').trim() || undefined,
      whyThisWorks:
        Array.isArray(geminiResponse.why_this_works) &&
        geminiResponse.why_this_works.length > 0
          ? geminiResponse.why_this_works
              .map((s) => String(s).trim())
              .filter(Boolean)
          : undefined,
    },
    confidence: 0.85,
  };
}

/**
 * AI-augmentatie: laat het model redeneren over dieetregels en ingrediënten.
 * Vult code-based violations aan met suggesties waar het model bv. "mozzarella = zuivel" afleidt.
 */
export async function suggestViolationsWithAI(
  recipe: RecipeData,
  ruleset: DietRuleset,
  dietName: string,
): Promise<ViolationDetail[]> {
  const gemini = getGeminiClient();
  const ingredients = Array.isArray(recipe.mealData?.ingredientRefs)
    ? recipe.mealData.ingredientRefs
    : Array.isArray(recipe.mealData?.ingredients)
      ? recipe.mealData.ingredients
      : [];
  const ingredientLines = ingredients
    .map(
      (ing: {
        displayName?: string;
        name?: string;
        original_line?: string;
        note?: string;
      }) => {
        const parts = [
          ing.displayName,
          ing.name,
          ing.original_line,
          ing.note,
        ].filter(Boolean);
        return parts.join(' ').trim();
      },
    )
    .filter(Boolean);
  const ruleSummary = [
    ...new Set(ruleset.forbidden.map((r) => r.ruleLabel)),
  ].join('; ');

  const prompt = `Je bent een dieetdeskundige. Gegeven de dieetregels en de recept-ingrediënten hieronder, welke ingrediënten wijken waarschijnlijk af?

DIET: ${dietName}
VERBODEN/BEPERKTE REGELS (uit dieetregels): ${ruleSummary}

RECEPT-INGREDIËNTEN (elk regel = één ingrediënt of combinatie):
${ingredientLines.map((l: string, i: number) => `${i + 1}. ${l}`).join('\n')}

Redeneer kort: bv. "mozzarella is zuivel", "honing is toegevoegde suiker", "sojasaus is soja".
Geef alleen suggesties met confidence >= ${AI_SUGGESTION_MIN_CONFIDENCE}.

Belangrijk: bloemkoolrijst (cauliflower rice) is een groente, GEEN zuivel; noem dit nooit als zuivel-/dairy-overtreding.

Antwoord in JSON: { "suggestions": [ { "ingredient": "exacte naam zoals in de lijst", "ruleLabel": "naam van de regel die geschonden wordt", "confidence": 0.85 } ] }
Alleen objecten met confidence >= ${AI_SUGGESTION_MIN_CONFIDENCE} opnemen.`;

  try {
    const raw = await gemini.generateJson({
      prompt,
      jsonSchema: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ingredient: { type: 'string' },
                ruleLabel: { type: 'string' },
                confidence: { type: 'number' },
              },
              required: ['ingredient', 'ruleLabel', 'confidence'],
            },
          },
        },
        required: ['suggestions'],
      },
      temperature: 0.2,
      purpose: 'repair',
    });
    const parsed = JSON.parse(raw);
    const suggestions = (parsed.suggestions || []).filter(
      (s: { confidence?: number }) =>
        (s.confidence ?? 0) >= AI_SUGGESTION_MIN_CONFIDENCE,
    );

    // False positives: ingrediënten die de AI soms ten onrechte als zuivel/dairy classificeert
    const isDairyRule = (label: string) => /zuivel|dairy/i.test(label ?? '');
    const dairyFalsePositiveIngredients = [
      'bloemkoolrijst',
      'bloemkool',
      'cauliflower rice',
      'cauliflower',
      'ijsblokjes',
      'ijsblokje',
      'kokosyoghurt',
      'kokos yoghurt',
      'amandelyoghurt',
      'amandel yoghurt',
      'haveryoghurt',
      'sojayoghurt',
      'plantaardige yoghurt',
      'kokosmelk',
      'amandelmelk',
      'havermelk',
      'sojamelk',
      'rijstmelk',
      'plantaardige melk',
      'rijstazijn',
      'rice vinegar',
    ];
    const isDairyFalsePositive = (ingredient: string, ruleLabel: string) => {
      if (!isDairyRule(ruleLabel)) return false;
      const norm = ingredient.trim().toLowerCase();
      return dairyFalsePositiveIngredients.some(
        (fp) => norm === fp || norm.includes(fp),
      );
    };

    const filtered = suggestions.filter(
      (s: { ingredient: string; ruleLabel: string }) =>
        !isDairyFalsePositive(s.ingredient, s.ruleLabel),
    );

    const ruleByLabel = new Map(ruleset.forbidden.map((r) => [r.ruleLabel, r]));
    return filtered.map((s: { ingredient: string; ruleLabel: string }) => {
      const rule =
        ruleByLabel.get(s.ruleLabel) ??
        ruleset.forbidden.find(
          (r) =>
            r.ruleLabel.includes(s.ruleLabel) ||
            s.ruleLabel.includes(r.ruleLabel),
        );
      const suggestion = rule?.substitutionSuggestions?.length
        ? `Vervang door ${rule.substitutionSuggestions.slice(0, 3).join(' of ')}`
        : 'Vervang voor een dieet-compatibele variant.';
      return {
        ingredientName: s.ingredient,
        ruleCode: rule?.ruleCode ?? 'AI_SUGGESTED',
        ruleLabel: s.ruleLabel,
        suggestion,
        substitutionSuggestions: rule?.substitutionSuggestions,
      };
    });
  } catch (err) {
    console.warn('[GeminiRecipeAdaptation] AI suggestViolations failed:', err);
    return [];
  }
}

/** Generieke adviestekst die nooit als ingrediëntnaam mag worden gebruikt. */
const GENERIC_SUGGESTION_PATTERNS = [
  'dieet-compatibele variant',
  'vervang dit ingrediënt voor een',
  'vervang voor een dieet-compatibele',
];

export function isGenericSuggestionText(text: string): boolean {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim().toLowerCase();
  return GENERIC_SUGGESTION_PATTERNS.some((p) => t.includes(p));
}

/**
 * Vraagt aan de AI een concreet, bij het gerecht passend alternatief per ingrediënt.
 * Gebruik wanneer de dieetregel alleen "Vervang door een dieet-compatibele variant" geeft.
 */
export async function suggestConcreteSubstitutes(
  recipe: RecipeData,
  violations: ViolationDetail[],
  indices: number[],
  ruleset: DietRuleset,
  dietName: string,
): Promise<Map<number, string>> {
  if (indices.length === 0) return new Map();
  const toAsk = indices
    .map((j) => ({ j, v: violations[j] }))
    .filter((x) => x.v);
  if (toAsk.length === 0) return new Map();

  const ingredientList = (
    Array.isArray(recipe.mealData?.ingredientRefs)
      ? recipe.mealData.ingredientRefs
      : Array.isArray(recipe.mealData?.ingredients)
        ? recipe.mealData.ingredients
        : []
  )
    .filter((ing: unknown) => ing != null)
    .map(
      (ing: { displayName?: string; name?: string; original_line?: string }) =>
        ing?.displayName ?? ing?.name ?? ing?.original_line ?? String(ing),
    )
    .filter(Boolean);
  const stepsPreview = (recipe.steps ?? [])
    .slice(0, 5)
    .map((s, i) => `${i + 1}. ${typeof s === 'string' ? s : String(s)}`)
    .join('\n');

  const lines = toAsk.map(
    (x) =>
      `- "${x.v.ingredientName}" (regel: ${x.v.ruleLabel}) → geef één concreet vervangingsingrediënt`,
  );
  const prompt = `Je bent een culinaire expert. Gegeven dit recept en dieet, kies voor elk van de onderstaande ingrediënten EÉN concreet vervangingsingrediënt dat past bij het gerecht en bij het dieet. Antwoord in het Nederlands met alleen de ingrediëntnaam (bijv. "appelazijn", "kokosamandel", "paprikapoeder").

DIET: ${dietName}

RECEPT: ${recipe.mealName}
Ingrediënten:
${ingredientList.slice(0, 30).join('\n')}

Bereidingswijze (fragment):
${stepsPreview}

Te vervangen ingrediënten (geef voor elk exact één alternatief):
${lines.join('\n')}

Antwoord in JSON: { "substitutes": [ { "originalName": "exacte naam uit de lijst", "suggestedSubstitute": "één ingrediënt in het Nederlands" } ] }`;

  try {
    const gemini = getGeminiClient();
    const raw = await gemini.generateJson({
      prompt,
      jsonSchema: {
        type: 'object',
        properties: {
          substitutes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                originalName: { type: 'string' },
                suggestedSubstitute: { type: 'string' },
              },
              required: ['originalName', 'suggestedSubstitute'],
            },
          },
        },
        required: ['substitutes'],
      },
      temperature: 0.3,
      purpose: 'repair',
    });
    const parsed = JSON.parse(raw);
    const substitutes = parsed.substitutes ?? [];
    const byOriginal = new Map(
      substitutes.map(
        (s: { originalName: string; suggestedSubstitute: string }) => [
          (s.originalName ?? '').trim().toLowerCase(),
          (s.suggestedSubstitute ?? '').trim(),
        ],
      ),
    );
    const result = new Map<number, string>();
    for (const { j, v } of toAsk) {
      const key = v.ingredientName.trim().toLowerCase();
      const sub = byOriginal.get(key);
      if (typeof sub === 'string' && sub && !isGenericSuggestionText(sub))
        result.set(j, sub);
    }
    return result;
  } catch (err) {
    console.warn(
      '[GeminiRecipeAdaptation] suggestConcreteSubstitutes failed:',
      err,
    );
    return new Map();
  }
}
