'use server';

import { isAdmin } from '@/src/lib/auth/roles';
import type { ActionResult } from '@/src/lib/types';
import {
  loadGuardrailsRuleset,
  evaluateGuardrails,
} from '@/src/lib/guardrails-vnext';
import type { TextAtom, GuardDecision } from '@/src/lib/guardrails-vnext/types';
import { getGuardReasonLabel } from '@/src/lib/guardrails-vnext/ui/reasonLabels';

/**
 * Preview evaluation input.
 * Geef óf recipeText (geplakt recept) óf ingredients/steps/metadata.
 */
export type GuardrailsPreviewInput = {
  dietTypeId: string;
  /** Geplakt recept: wordt ontleed in ingrediënten, stappen en optioneel metadata. */
  recipeText?: string;
  ingredients?: string;
  steps?: string;
  metadata?: string;
};

/**
 * Preview evaluation result view model
 */
export type GuardrailsPreviewResult = {
  outcome: 'allowed' | 'blocked' | 'warned';
  ok: boolean;
  /** Korte uitleg waarom het recept wel/niet voldoet. */
  explanation: string;
  reasonCodes: string[];
  contentHash: string;
  rulesetVersion: number;
  /** Alleen aanwezig wanneer input via recipeText was; toont wat er ontleed is. */
  parsedRecipe?: { ingredients: string; steps: string; metadata: string };
  matchesSummary: {
    totalMatches: number;
    appliedRules: number;
    byAction: {
      allow: number;
      block: number;
    };
    byTarget: {
      ingredient: number;
      step: number;
      metadata: number;
    };
  };
  topMatches: Array<{
    ruleId: string;
    ruleLabel?: string;
    matchedText: string;
    targetPath: string;
    matchMode: string;
  }>;
};

/**
 * Herkent sectiekopjes in geplakte recepttekst (NL/EN).
 * Retourneert { ingredients, steps, metadata } als newline-gescheiden regels.
 */
function parsePastedRecipeText(raw: string): {
  ingredients: string;
  steps: string;
  metadata: string;
} {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const ingredientHeaders = [
    'ingrediënten',
    'ingredients',
    'ingredienten',
    'benodigdheden',
  ];
  const stepHeaders = [
    'bereiding',
    'instructies',
    'stappen',
    'instructions',
    'steps',
    'directions',
    'method',
    'wijze van bereiding',
    'voorbereiding',
    'preparation',
  ];
  const metadataHeaders = [
    'metadata',
    'tags',
    'categorieën',
    'categorie',
    'kenmerken',
  ];

  type Section = 'ingredients' | 'steps' | 'metadata' | 'unknown';
  const sections: { section: Section; lines: string[] }[] = [];
  let current: Section = 'ingredients';
  let currentLines: string[] = [];

  function flush() {
    if (currentLines.length) {
      sections.push({ section: current, lines: [...currentLines] });
      currentLines = [];
    }
  }

  function stripListMarker(s: string): string {
    return s
      .replace(/^[-*•]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .replace(/^stap\s+\d+[.:]\s*/i, '')
      .replace(/^step\s+\d+[.:]\s*/i, '')
      .trim();
  }

  for (const line of lines) {
    const lower = line.toLowerCase();
    let next: Section | null = null;

    for (const h of ingredientHeaders) {
      if (lower === h || lower.startsWith(h + ':') || lower === h + ' ') {
        next = 'ingredients';
        break;
      }
    }
    if (!next) {
      for (const h of stepHeaders) {
        if (lower === h || lower.startsWith(h + ':') || lower === h + ' ') {
          next = 'steps';
          break;
        }
      }
    }
    if (!next) {
      for (const h of metadataHeaders) {
        if (lower === h || lower.startsWith(h + ':') || lower === h + ' ') {
          next = 'metadata';
          break;
        }
      }
    }

    if (next) {
      flush();
      current = next;
      const afterColon = line.replace(/^[^:]*:\s*/i, '').trim();
      if (afterColon) currentLines.push(stripListMarker(afterColon));
    } else if (line) {
      currentLines.push(stripListMarker(line));
    }
  }
  flush();

  const bySection = {
    ingredients: [] as string[],
    steps: [] as string[],
    metadata: [] as string[],
  };
  for (const { section, lines: ls } of sections) {
    if (section !== 'unknown') {
      bySection[section].push(...ls.filter((l) => l.length > 0));
    }
  }

  // Als er geen headers waren: eerste blok als ingrediënten, tweede als stappen
  if (sections.length === 0 && lines.length > 0) {
    const nonEmpty = lines.filter((l) => l.length > 0).map(stripListMarker);
    const half = Math.ceil(nonEmpty.length / 2);
    bySection.ingredients = nonEmpty.slice(0, half);
    bySection.steps = nonEmpty.slice(half);
  }

  // Geen sectiekopjes: eerste helft als ingrediënten, tweede helft als stappen
  if (bySection.steps.length === 0 && bySection.ingredients.length > 1) {
    const mid = Math.ceil(bySection.ingredients.length / 2);
    bySection.steps = bySection.ingredients.splice(mid);
  }

  return {
    ingredients: bySection.ingredients.join('\n'),
    steps: bySection.steps.join('\n'),
    metadata: bySection.metadata.join('\n'),
  };
}

/**
 * Parse textarea input to TextAtoms
 */
function parseTextareaToAtoms(
  text: string,
  prefix: 'ingredients' | 'steps' | 'metadata',
): TextAtom[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => ({
      text: line.toLowerCase(),
      path: `${prefix}[${index}]`,
      locale: 'nl' as const,
    }));
}

/**
 * Evaluate guard rails for preview (admin only)
 *
 * @param input - Preview input (dietTypeId, ingredients, steps, metadata)
 * @returns Preview evaluation result
 */
export async function evaluateDietGuardrailsAction(
  input: GuardrailsPreviewInput,
): Promise<ActionResult<GuardrailsPreviewResult>> {
  const admin = await isAdmin();
  if (!admin) {
    return {
      error: 'Geen toegang: alleen admins kunnen guard rails evalueren',
    };
  }

  if (!input.dietTypeId) {
    return { error: 'Diet ID is vereist' };
  }

  const hasRecipe = (input.recipeText ?? '').trim().length > 0;
  const hasParts =
    (input.ingredients ?? '').trim().length > 0 ||
    (input.steps ?? '').trim().length > 0 ||
    (input.metadata ?? '').trim().length > 0;
  if (!hasRecipe && !hasParts) {
    return {
      error: 'Plak een recept of vul ingrediënten/stappen/metadata in.',
    };
  }

  const parsed = hasRecipe
    ? parsePastedRecipeText(input.recipeText!.trim())
    : null;
  const ingredients = parsed?.ingredients ?? input.ingredients ?? '';
  const steps = parsed?.steps ?? input.steps ?? '';
  const metadata = parsed?.metadata ?? input.metadata ?? '';

  try {
    // Load ruleset
    const ruleset = await loadGuardrailsRuleset({
      dietId: input.dietTypeId,
      mode: 'recipe_adaptation',
      locale: 'nl',
    });

    // Parse inputs to TextAtoms
    const ingredientAtoms = parseTextareaToAtoms(ingredients, 'ingredients');
    const stepAtoms = parseTextareaToAtoms(steps, 'steps');
    const metadataAtoms = parseTextareaToAtoms(metadata, 'metadata');

    // Build evaluation context
    const context = {
      dietId: input.dietTypeId,
      locale: 'nl' as const,
      mode: 'recipe_adaptation' as const,
      timestamp: new Date().toISOString(),
    };

    // Evaluate
    const decision: GuardDecision = evaluateGuardrails({
      ruleset,
      context,
      targets: {
        ingredient: ingredientAtoms,
        step: stepAtoms,
        metadata: metadataAtoms,
      },
    });

    // Build matches summary
    const matchesByAction = {
      allow: 0,
      block: 0,
    };
    const matchesByTarget = {
      ingredient: 0,
      step: 0,
      metadata: 0,
    };

    // Count matches by action and target
    for (const match of decision.matches) {
      // Find rule to determine action
      const rule = ruleset.rules.find((r) => r.id === match.ruleId);
      if (rule) {
        if (rule.action === 'allow') {
          matchesByAction.allow++;
        } else if (rule.action === 'block') {
          matchesByAction.block++;
        }
      }

      // Count by target path
      if (match.targetPath.startsWith('ingredients[')) {
        matchesByTarget.ingredient++;
      } else if (match.targetPath.startsWith('steps[')) {
        matchesByTarget.step++;
      } else if (match.targetPath.startsWith('metadata[')) {
        matchesByTarget.metadata++;
      }
    }

    // Get top 5 matches (prioritize applied rules)
    const topMatches = decision.matches.slice(0, 5).map((match) => {
      const rule = ruleset.rules.find((r) => r.id === match.ruleId);
      return {
        ruleId: match.ruleId,
        ruleLabel: rule?.metadata.label,
        matchedText:
          match.matchedText.length > 80
            ? match.matchedText.substring(0, 80) + '...'
            : match.matchedText,
        targetPath: match.targetPath,
        matchMode: match.matchMode,
      };
    });

    const blockMatches = decision.matches.filter((m) => {
      const r = ruleset.rules.find((x) => x.id === m.ruleId);
      return r?.action === 'block';
    });
    const explanation = decision.ok
      ? 'Dit recept voldoet aan de actieve dieetregels.'
      : [
          'Dit recept voldoet niet aan de dieetregels:',
          ...decision.reasonCodes.map((c) => getGuardReasonLabel(c)),
          ...blockMatches.slice(0, 3).map((m) => {
            const r = ruleset.rules.find((x) => x.id === m.ruleId);
            const label = r?.metadata?.label ?? m.ruleId;
            const snip =
              m.matchedText.length > 60
                ? m.matchedText.slice(0, 60) + '…'
                : m.matchedText;
            return `${label} (${snip})`;
          }),
        ].join(' ');

    const result: GuardrailsPreviewResult = {
      outcome: decision.outcome,
      ok: decision.ok,
      explanation,
      reasonCodes: decision.reasonCodes,
      contentHash: ruleset.contentHash,
      rulesetVersion: ruleset.version,
      ...(parsed && { parsedRecipe: parsed }),
      matchesSummary: {
        totalMatches: decision.matches.length,
        appliedRules: decision.appliedRuleIds.length,
        byAction: matchesByAction,
        byTarget: matchesByTarget,
      },
      topMatches,
    };

    return { data: result };
  } catch (error) {
    console.error('Error evaluating guard rails:', error);
    return {
      error: `Fout bij evalueren guard rails: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
    };
  }
}
