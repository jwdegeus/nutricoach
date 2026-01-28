'use server';

import { isAdmin } from '@/src/lib/auth/roles';
import type { ActionResult } from '@/src/lib/types';
import { createClient } from '@/src/lib/supabase/server';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import {
  getDietGroupPoliciesAction,
  type GroupPolicyRow,
} from './guardrails.actions';
import type { DietLogicType } from './guardrails.actions';

const DIET_GUIDELINES_CONTEXT = `
Dieetregels volgen Diet Logic (P0–P3):
- DROP (P0): Ingrediënt in geblokkeerde categorie → recept/maaltijd ongeldig. Meestal strictness "hard".
- FORCE (P1): Verplicht quotum (bv. 3 cups groenten, 3×/week orgaanvlees). min_per_day/min_per_week vullen.
- LIMIT (P2): Beperkt gebruik (bv. max 1/dag). max_per_day/max_per_week vullen, vaak strictness "soft" voor waarschuwing.
- PASS (P3): Toegestaan, vrije invulling. Geen min/max.

Wahls-richtlijnen (indien van toepassing):
- Level 1: DROP gluten/zuivel/soja/geraffineerde suiker; LIMIT granen/peulvruchten (max 1/dag); FORCE 3-3-3 cups groenten.
- Level 2: DROP ook granen/peulvruchten; FORCE + orgaanvlees 3×/week, zeegroenten, gefermenteerd.
- Level 3: DROP zetmeelrijke groenten; LIMIT fruit (alleen bessen, max 1 cup), noten/zaden; FORCE gezonde vetten.
Prioriteit: 1 = hoogst (evalueren eerst), 65500 = laagst. DROP-regels vaak 50–200, FORCE 100–300, LIMIT 200–400, PASS 400–65500.
`;

/** Haal het eerste geldige JSON-object uit modeloutput (tekst, markdown of code block). */
function extractJsonFromResponse(raw: string): string {
  let trimmed = raw.trim();
  // Strip markdown code block: ```json ... ``` of ``` ... ```
  const jsonBlock = /^```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (jsonBlock) {
    trimmed = jsonBlock[1].trim();
  }
  // Negeer tekst vóór het eerste { (bijv. "Hier is de analyse:")
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace === -1) {
    return trimmed;
  }
  trimmed = trimmed.slice(firstBrace);
  let depth = 0;
  let end = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return end >= 0 ? trimmed.slice(0, end + 1) : trimmed;
}

/** Uitvoerbare actie: prioriteit van alle regels met een bepaalde diet_logic zetten */
export type SetPriorityByDietLogicAction = {
  type: 'set_priority_by_diet_logic';
  dietLogic: DietLogicType;
  value: number;
};

export type DietRuleSuggestion = {
  text: string;
  action?: SetPriorityByDietLogicAction;
};

export type DietRulesAnalysis = {
  summary: string;
  /** 0–100: hoe goed de regels voldoen aan de richtlijnen */
  complianceScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: DietRuleSuggestion[];
};

/**
 * Analyseer huidige dieetregels met Gemini en geef verbeteradvies.
 * Alleen voor admin.
 */
export async function analyzeDietRulesWithAI(
  dietTypeId: string,
): Promise<ActionResult<DietRulesAnalysis>> {
  const ok = await isAdmin();
  if (!ok) {
    return { error: 'Geen toegang: alleen admins kunnen AI-analyse uitvoeren' };
  }
  if (!dietTypeId) {
    return { error: 'Diet type ID is vereist' };
  }

  try {
    const supabase = await createClient();
    const { data: dietType, error: dietError } = await supabase
      .from('diet_types')
      .select('id, name')
      .eq('id', dietTypeId)
      .single();

    if (dietError || !dietType) {
      return { error: 'Dieettype niet gevonden' };
    }

    const policiesResult = await getDietGroupPoliciesAction(dietTypeId);
    if ('error' in policiesResult) {
      return { error: policiesResult.error };
    }
    const policies: GroupPolicyRow[] = policiesResult.data ?? [];

    const rulesSummary = policies.map((p) => ({
      category: p.categoryName,
      slug: p.categorySlug,
      dietLogic: p.dietLogic,
      action: p.action,
      strictness: p.strictness,
      priority: p.priority,
      minPerDay: p.minPerDay,
      minPerWeek: p.minPerWeek,
      maxPerDay: p.maxPerDay,
      maxPerWeek: p.maxPerWeek,
    }));

    const gemini = getGeminiClient();
    const prompt = `Je bent een expert in dieetregels voor therapeutische diëten (o.a. Wahls).

${DIET_GUIDELINES_CONTEXT}

**Huidige dieetregels voor dieet "${dietType.name}"** (als JSON):
${JSON.stringify(rulesSummary, null, 2)}

Analyseer deze regels en geef een JSON-object met exact deze velden: complianceScore (getal 0–100), summary (string), strengths (array van strings), weaknesses (array van strings), suggestions (array van objecten).
- complianceScore: Getal 0–100: hoe goed de regels voldoen aan de richtlijnen (100 = volledig conform, 0 = ernstige problemen).
- summary: Korte samenvatting (2–4 zinnen) van de huidige configuratie en of die logisch is.
- strengths: Sterke punten (wat klopt er goed?).
- weaknesses: Zwakke punten of inconsistenties (bijv. FORCE zonder min_per_day, ontbrekende groepen).
- suggestions: Array van objecten met { text: string, action?: object }. text = concrete verbetervoorstel in het Nederlands. Bij prioriteitsadviezen vul action: { type: "set_priority_by_diet_logic", dietLogic: "drop"|"force"|"limit"|"pass", value: getal }. Voorbeeld: "Zet prioriteit van DROP-regels op 10" → { "text": "Zet prioriteit van DROP-regels op 10", "action": { "type": "set_priority_by_diet_logic", "dietLogic": "drop", "value": 10 } }. Alleen action vullen bij adviezen over prioriteit van één diet_logic-type.

Belangrijk: antwoord ALLEEN met één geldig JSON-object. Geen tekst vóór of na het object, geen "Hier is de analyse" of uitleg.`;

    const jsonSchema = {
      type: 'object',
      properties: {
        complianceScore: { type: 'number' },
        summary: { type: 'string' },
        strengths: { type: 'array', items: { type: 'string' } },
        weaknesses: { type: 'array', items: { type: 'string' } },
        suggestions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              action: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['set_priority_by_diet_logic'],
                  },
                  dietLogic: {
                    type: 'string',
                    enum: ['drop', 'force', 'limit', 'pass'],
                  },
                  value: { type: 'number' },
                },
                required: ['type', 'dietLogic', 'value'],
              },
            },
            required: ['text'],
          },
        },
      },
      required: [
        'complianceScore',
        'summary',
        'strengths',
        'weaknesses',
        'suggestions',
      ],
    };

    const raw = await gemini.generateJson({
      prompt,
      jsonSchema,
      temperature: 0.3,
      purpose: 'plan',
    });

    const jsonStr = extractJsonFromResponse(raw);
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const score = Number(parsed.complianceScore);
    const rawSuggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
      : [];
    const suggestions: DietRuleSuggestion[] = rawSuggestions.map(
      (s: unknown) => {
        if (typeof s === 'string') return { text: s };
        if (s && typeof s === 'object' && 'text' in s) {
          const o = s as { text: string; action?: unknown };
          let action: SetPriorityByDietLogicAction | undefined;
          if (
            o.action &&
            typeof o.action === 'object' &&
            o.action !== null &&
            'type' in o.action &&
            'dietLogic' in o.action &&
            'value' in o.action
          ) {
            const a = o.action as {
              type: string;
              dietLogic: string;
              value: number;
            };
            if (
              a.type === 'set_priority_by_diet_logic' &&
              ['drop', 'force', 'limit', 'pass'].includes(a.dietLogic)
            ) {
              action = {
                type: 'set_priority_by_diet_logic',
                dietLogic: a.dietLogic as DietLogicType,
                value: Math.min(
                  65500,
                  Math.max(1, Math.round(Number(a.value) || 100)),
                ),
              };
            }
          }
          return { text: String(o.text ?? ''), action };
        }
        return { text: String(s) };
      },
    );
    const analysis: DietRulesAnalysis = {
      complianceScore: Math.min(
        100,
        Math.max(0, Number.isFinite(score) ? score : 0),
      ),
      summary: String(parsed.summary ?? ''),
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.map(String)
        : [],
      weaknesses: Array.isArray(parsed.weaknesses)
        ? parsed.weaknesses.map(String)
        : [],
      suggestions,
    };
    return { data: analysis };
  } catch (e) {
    console.error('analyzeDietRulesWithAI error:', e);
    return {
      error:
        e instanceof Error
          ? e.message
          : 'Er is een fout opgetreden bij de AI-analyse',
    };
  }
}

/**
 * Voer een analyse-actie uit (bijv. prioriteit van alle DROP-regels zetten).
 * Alleen voor admin.
 */
export async function applyDietRuleAnalysisAction(
  dietTypeId: string,
  action: SetPriorityByDietLogicAction,
): Promise<ActionResult<{ updated: number }>> {
  const ok = await isAdmin();
  if (!ok) {
    return {
      error: 'Geen toegang: alleen admins kunnen analyse-acties uitvoeren',
    };
  }
  if (!dietTypeId || action.type !== 'set_priority_by_diet_logic') {
    return { error: 'Ongeldige actie' };
  }
  const value = Math.min(65500, Math.max(1, Math.round(action.value)));
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('diet_category_constraints')
      .update({
        rule_priority: value,
        priority: value,
      })
      .eq('diet_type_id', dietTypeId)
      .eq('diet_logic', action.dietLogic)
      .eq('is_active', true)
      .select('id');

    if (error) {
      return { error: `Fout bij bijwerken: ${error.message}` };
    }
    return { data: { updated: data?.length ?? 0 } };
  } catch (e) {
    console.error('applyDietRuleAnalysisAction error:', e);
    return {
      error:
        e instanceof Error
          ? e.message
          : 'Er is een fout opgetreden bij toepassen',
    };
  }
}

export type ConstraintSettingsSuggestion = {
  dietLogic: DietLogicType;
  strictness: 'hard' | 'soft';
  priority: number;
  minPerDay: number | null;
  minPerWeek: number | null;
  maxPerDay: number | null;
  maxPerWeek: number | null;
};

/**
 * Genereer voorgestelde instellingen voor een nieuwe dieetregel op basis van
 * ingrediëntgroep, bestaande regels en dieetrichtlijnen. Alleen voor admin.
 */
export async function suggestConstraintSettingsWithAI(input: {
  dietTypeId: string;
  categoryId: string;
}): Promise<ActionResult<ConstraintSettingsSuggestion>> {
  const ok = await isAdmin();
  if (!ok) {
    return {
      error: 'Geen toegang: alleen admins kunnen AI-suggesties gebruiken',
    };
  }
  if (!input.dietTypeId || !input.categoryId) {
    return { error: 'Diet type ID en category ID zijn vereist' };
  }

  try {
    const supabase = await createClient();

    const [
      { data: dietType, error: dietError },
      { data: category, error: catError },
    ] = await Promise.all([
      supabase
        .from('diet_types')
        .select('id, name')
        .eq('id', input.dietTypeId)
        .single(),
      supabase
        .from('ingredient_categories')
        .select('id, code, name_nl, name_en, category_type')
        .eq('id', input.categoryId)
        .single(),
    ]);

    if (dietError || !dietType) {
      return { error: 'Dieettype niet gevonden' };
    }
    if (catError || !category) {
      return { error: 'Ingrediëntgroep niet gevonden' };
    }

    const policiesResult = await getDietGroupPoliciesAction(input.dietTypeId);
    if ('error' in policiesResult) {
      return { error: policiesResult.error };
    }
    const policies: GroupPolicyRow[] = policiesResult.data ?? [];
    const existingSummary = policies.map((p) => ({
      category: p.categoryName,
      slug: p.categorySlug,
      dietLogic: p.dietLogic,
      strictness: p.strictness,
      priority: p.priority,
      minPerDay: p.minPerDay,
      minPerWeek: p.minPerWeek,
      maxPerDay: p.maxPerDay,
      maxPerWeek: p.maxPerWeek,
    }));

    const gemini = getGeminiClient();
    const categoryName = category.name_nl || category.name_en || category.code;
    const prompt = `Je bent een expert in dieetregels voor therapeutische diëten.

${DIET_GUIDELINES_CONTEXT}

**Dieet:** ${dietType.name}
**Nieuwe ingrediëntgroep voor welke we een regel willen:** ${categoryName} (code: ${category.code}, type: ${category.category_type}).

**Bestaande dieetregels voor dit dieet** (andere groepen):
${JSON.stringify(existingSummary, null, 2)}

Bepaal passende instellingen voor een nieuwe regel voor de groep "${categoryName}". Houd rekening met:
- de betekenis van de groep (code/type) en de bestaande regels;
- onderlinge consistentie (prioriteit, diet_logic-keuze);
- de richtlijnen hierboven.

Belangrijk: antwoord ALLEEN met één geldig JSON-object, geen introductietekst of uitleg ervoor of erna. Exact deze velden:
- dietLogic: "drop" | "force" | "limit" | "pass"
- strictness: "hard" | "soft"
- priority: getal 1–65500 (1 = hoogst)
- minPerDay: getal of null (alleen bij force)
- minPerWeek: getal of null (alleen bij force)
- maxPerDay: getal of null (alleen bij limit)
- maxPerWeek: getal of null (alleen bij limit)`;

    const jsonSchema = {
      type: 'object',
      properties: {
        dietLogic: {
          type: 'string',
          enum: ['drop', 'force', 'limit', 'pass'],
        },
        strictness: { type: 'string', enum: ['hard', 'soft'] },
        priority: { type: 'number' },
        minPerDay: { type: ['number', 'null'] },
        minPerWeek: { type: ['number', 'null'] },
        maxPerDay: { type: ['number', 'null'] },
        maxPerWeek: { type: ['number', 'null'] },
      },
      required: [
        'dietLogic',
        'strictness',
        'priority',
        'minPerDay',
        'minPerWeek',
        'maxPerDay',
        'maxPerWeek',
      ],
    };

    const raw = await gemini.generateJson({
      prompt,
      jsonSchema,
      temperature: 0.2,
      purpose: 'plan',
    });

    const jsonStr = extractJsonFromResponse(raw);
    const parsed = JSON.parse(jsonStr) as ConstraintSettingsSuggestion;
    // Normalise nulls and priority range
    const suggestion: ConstraintSettingsSuggestion = {
      dietLogic: parsed.dietLogic ?? 'drop',
      strictness: parsed.strictness ?? 'hard',
      priority: Math.min(
        65500,
        Math.max(1, Math.round(Number(parsed.priority) || 100)),
      ),
      minPerDay: parsed.minPerDay != null ? Number(parsed.minPerDay) : null,
      minPerWeek: parsed.minPerWeek != null ? Number(parsed.minPerWeek) : null,
      maxPerDay: parsed.maxPerDay != null ? Number(parsed.maxPerDay) : null,
      maxPerWeek: parsed.maxPerWeek != null ? Number(parsed.maxPerWeek) : null,
    };
    return { data: suggestion };
  } catch (e) {
    console.error('suggestConstraintSettingsWithAI error:', e);
    return {
      error:
        e instanceof Error
          ? e.message
          : 'Er is een fout opgetreden bij de AI-suggestie',
    };
  }
}
