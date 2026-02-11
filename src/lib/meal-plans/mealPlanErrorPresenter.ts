/**
 * Centralized meal-plan generation error presentation (NL user messages + safe diagnostics).
 * No PII; diagnostics only counts, ratios, codes.
 */

import { AppError, type AppErrorCode } from '@/src/lib/errors/app-error';

export type MealPlanErrorPresentation = {
  code: AppErrorCode | 'UNKNOWN';
  userMessageNl: string;
  userActionHints: string[];
  diagnostics?: Record<string, unknown>;
};

const MAX_HINTS = 3;

/** Allowed keys for diagnostics (no cause, no PII). Includes nested keys for variety scorecard (targets, meetsTargets). */
const SAFE_DIAGNOSTIC_KEYS = new Set([
  'dbSlots',
  'totalSlots',
  'requiredRatio',
  'actualRatio',
  'generated',
  'maxAllowed',
  'violations',
  'uniqueVegCount',
  'uniqueFruitCount',
  'proteinUniqueCount',
  'maxRepeatWithinDays',
  'repeatWindowDays',
  'targets',
  'meetsTargets',
  'unique_veg_min',
  'unique_fruit_min',
  'protein_rotation_min_categories',
  'max_repeat_same_recipe_within_days',
  'meetsUniqueVegMin',
  'meetsUniqueFruitMin',
  'meetsProteinRotation',
  'meetsRepeatWindow',
  'attempt',
  'retryReason',
  'rule_code',
  'reason',
  'slot_type',
  'day_index',
]);

function sanitizeDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (k === 'cause') continue;
    if (!SAFE_DIAGNOSTIC_KEYS.has(k)) continue;
    if (Array.isArray(v)) {
      out[k] = v
        .map((item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? sanitizeDetails(item as Record<string, unknown>)
            : typeof item === 'number' ||
                typeof item === 'string' ||
                typeof item === 'boolean'
              ? item
              : undefined,
        )
        .filter((x) => x !== undefined);
    } else if (
      typeof v === 'number' ||
      typeof v === 'string' ||
      typeof v === 'boolean'
    ) {
      out[k] = v;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = sanitizeDetails(v as Record<string, unknown>);
      if (nested && Object.keys(nested).length > 0) out[k] = nested;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const MEAL_PLAN_ERROR_MAP: Record<
  AppErrorCode,
  { userMessageNl: string; userActionHints: string[] }
> = {
  MEAL_PLAN_VARIETY_TARGETS_NOT_MET: {
    userMessageNl:
      'Het menu voldoet niet aan de variatiedoelen (groente, fruit, proteïne of herhaling).',
    userActionHints: [
      'Voeg meer recepten toe aan je database.',
      'Pas variatie-instellingen aan in beheer (admin).',
      'Probeer opnieuw; het systeem probeert automatisch een gevarieerder menu.',
    ],
  },
  MEAL_PLAN_CULINARY_VIOLATION: {
    userMessageNl:
      'Er zit een culinaire mismatch in het menu (bijv. onlogische combinatie in een smoothie).',
    userActionHints: [
      'Probeer opnieuw te genereren.',
      'Pas culinaire regels aan in beheer (admin).',
    ],
  },
  MEAL_PLAN_DB_COVERAGE_TOO_LOW: {
    userMessageNl: 'Het menu bevat te weinig recepten uit je eigen database.',
    userActionHints: [
      'Voeg meer recepten toe.',
      'Verlaag de vereiste verhouding in beheerinstellingen (admin).',
    ],
  },
  MEAL_PLAN_AI_BUDGET_EXCEEDED: {
    userMessageNl:
      'Het aantal AI-gegenereerde maaltijden overschrijdt het maximum.',
    userActionHints: [
      'Voeg meer recepten toe.',
      'Vraag de beheerder het maximum aan AI-slots aan te passen.',
    ],
  },
  MEAL_PLAN_INSUFFICIENT_CANDIDATES: {
    userMessageNl: 'Niet genoeg recepten om het plan te vullen zonder AI.',
    userActionHints: [
      'Voeg meer recepten toe aan je database.',
      'Pas de generatorinstellingen aan in beheer (admin).',
    ],
  },
  MEAL_PLAN_CONFIG_INVALID: {
    userMessageNl: 'De generatorconfiguratie is ongeldig of ontbreekt.',
    userActionHints: [
      'Controleer de beheerinstellingen (templates, pools, variatiedoelen).',
      'Neem contact op met de beheerder als het probleem blijft.',
    ],
  },
  MEAL_PLAN_SANITY_FAILED: {
    userMessageNl:
      'Het gegenereerde menu voldoet niet aan de kwaliteitscontroles.',
    userActionHints: [
      'Probeer opnieuw te genereren.',
      'Pas indien nodig je voorkeuren of dieet aan.',
    ],
  },
  AUTH_ERROR: {
    userMessageNl: 'Je moet ingelogd zijn.',
    userActionHints: ['Log opnieuw in.'],
  },
  UNAUTHORIZED: {
    userMessageNl: 'Je hebt geen toegang tot deze actie.',
    userActionHints: [],
  },
  VALIDATION_ERROR: {
    userMessageNl: 'De invoer is ongeldig.',
    userActionHints: ['Controleer de ingevoerde gegevens en probeer opnieuw.'],
  },
  DB_ERROR: {
    userMessageNl: 'Er ging iets mis bij het opslaan of ophalen van gegevens.',
    userActionHints: ['Probeer het later opnieuw.'],
  },
  AGENT_ERROR: {
    userMessageNl: 'De menu-generatie is mislukt.',
    userActionHints: [
      'Probeer opnieuw.',
      'Als het blijft mislukken, pas je voorkeuren of dieet aan.',
    ],
  },
  RATE_LIMIT: {
    userMessageNl:
      'Je hebt het maximum aantal acties bereikt. Wacht even en probeer opnieuw.',
    userActionHints: ['Wacht een paar minuten en probeer opnieuw.'],
  },
  CONFLICT: {
    userMessageNl: 'Er bestaat al een weekmenu voor deze periode.',
    userActionHints: ['Kies een andere periode of open het bestaande plan.'],
  },
  GUARDRAILS_VIOLATION: {
    userMessageNl: 'Het menu voldoet niet aan je dieetregels of restricties.',
    userActionHints: ['Pas je dieetvoorkeuren aan of probeer opnieuw.'],
  },
  MEAL_LOCKED: {
    userMessageNl: 'Deze maaltijd kan niet worden gewijzigd.',
    userActionHints: [],
  },
  INSUFFICIENT_ALLOWED_INGREDIENTS: {
    userMessageNl: 'Er zijn te weinig toegestane ingrediënten voor dit dieet.',
    userActionHints: [
      'Voeg meer recepten toe die passen bij je dieet.',
      'Pas je dieetvoorkeuren aan in beheer (admin).',
    ],
  },
  INTERNAL: {
    userMessageNl: 'Er ging iets mis. Probeer het opnieuw.',
    userActionHints: [
      'Probeer later opnieuw.',
      'Neem contact op als het probleem blijft.',
    ],
  },
};

/**
 * Build an actionable inbox message (max 500 chars) for failed meal plan generation.
 * Used when creating user_inbox_notifications.
 */
export function buildActionableInboxMessage(
  presentation: MealPlanErrorPresentation,
): string {
  const { code, userMessageNl, userActionHints, diagnostics } = presentation;
  const parts: string[] = [userMessageNl];

  if (code === 'MEAL_PLAN_VARIETY_TARGETS_NOT_MET' && diagnostics) {
    const d = diagnostics as Record<string, unknown>;
    const targets = d.targets as Record<string, number> | undefined;
    const meets = d.meetsTargets as Record<string, boolean> | undefined;
    const tasks: string[] = [];
    if (
      meets?.meetsUniqueVegMin === false &&
      typeof d.uniqueVegCount === 'number' &&
      targets?.unique_veg_min != null
    ) {
      const need = targets.unique_veg_min - (d.uniqueVegCount as number);
      tasks.push(
        `Voeg minstens ${need} recept(en) met groenten toe (je hebt ${d.uniqueVegCount}, minimaal ${targets.unique_veg_min})`,
      );
    }
    if (
      meets?.meetsUniqueFruitMin === false &&
      typeof d.uniqueFruitCount === 'number' &&
      targets?.unique_fruit_min != null
    ) {
      const need = targets.unique_fruit_min - (d.uniqueFruitCount as number);
      tasks.push(
        `Voeg minstens ${need} recept(en) met fruit toe (je hebt ${d.uniqueFruitCount}, minimaal ${targets.unique_fruit_min})`,
      );
    }
    if (
      meets?.meetsProteinRotation === false &&
      typeof d.proteinUniqueCount === 'number' &&
      targets?.protein_rotation_min_categories != null
    ) {
      tasks.push(
        `Voeg meer eiwitcategorieën toe (je hebt ${d.proteinUniqueCount}, minimaal ${targets.protein_rotation_min_categories})`,
      );
    }
    if (meets?.meetsRepeatWindow === false) {
      const max = targets?.max_repeat_same_recipe_within_days ?? 3;
      tasks.push(
        `Verminder herhaling: max ${max}× hetzelfde recept per week. Voeg meer gevarieerde recepten toe.`,
      );
    }
    if (tasks.length > 0) {
      parts.push('', 'Taken:');
      tasks.forEach((t, i) => parts.push(`${i + 1}. ${t}`));
      parts.push(
        '',
        'Recepten moeten: ontbijt/lunch/diner zijn, ingrediënten met NEVO-koppeling hebben. Pas eventueel variatie-instellingen aan in beheer (admin).',
      );
    }
  } else if (userActionHints.length > 0) {
    parts.push('', ...userActionHints);
  }

  const text = parts.join('\n').trim();
  return text.length > 500 ? text.slice(0, 497) + '…' : text;
}

/**
 * Map an error (from createPlanForUser or related flows) to a safe, NL user-facing presentation.
 * Use in action/route handlers before returning error to UI.
 */
export function presentMealPlanError(
  error: unknown,
): MealPlanErrorPresentation {
  if (error instanceof AppError) {
    const mapped =
      MEAL_PLAN_ERROR_MAP[error.code as keyof typeof MEAL_PLAN_ERROR_MAP];
    let userMessageNl = mapped?.userMessageNl ?? error.safeMessage;
    if (error.code === 'MEAL_PLAN_VARIETY_TARGETS_NOT_MET' && error.details) {
      const d = error.details as Record<string, unknown>;
      const targets = d.targets as Record<string, number> | undefined;
      const meets = d.meetsTargets as Record<string, boolean> | undefined;
      const parts: string[] = [];
      if (
        meets?.meetsUniqueVegMin === false &&
        typeof d.uniqueVegCount === 'number' &&
        targets?.unique_veg_min != null
      ) {
        parts.push(
          `te weinig groenten (${d.uniqueVegCount} van minimaal ${targets.unique_veg_min})`,
        );
      }
      if (
        meets?.meetsUniqueFruitMin === false &&
        typeof d.uniqueFruitCount === 'number' &&
        targets?.unique_fruit_min != null
      ) {
        parts.push(
          `te weinig fruit (${d.uniqueFruitCount} van minimaal ${targets.unique_fruit_min})`,
        );
      }
      if (
        meets?.meetsProteinRotation === false &&
        typeof d.proteinUniqueCount === 'number' &&
        targets?.protein_rotation_min_categories != null
      ) {
        parts.push(
          `te weinig eiwitcategorieën (${d.proteinUniqueCount} van minimaal ${targets.protein_rotation_min_categories})`,
        );
      }
      if (meets?.meetsRepeatWindow === false) {
        parts.push('te veel herhaling van hetzelfde recept binnen de week');
      }
      if (parts.length > 0) {
        userMessageNl = `Het menu voldoet niet aan de variatiedoelen: ${parts.join(', ')}.`;
      }
    }
    if (error.code === 'AGENT_ERROR' && error.safeMessage) {
      if (error.safeMessage.includes('MEAL_PREFERENCE_MISS')) {
        userMessageNl =
          'Het menu voldoet niet aan je maaltijdvoorkeuren (bijv. eiwitshake bij ontbijt).';
      } else if (error.safeMessage.includes('ALLERGEN_PRESENT')) {
        userMessageNl =
          'Het menu bevat een ingrediënt dat niet past bij je allergieën of uitsluitingen.';
      } else if (error.safeMessage.includes('FORBIDDEN_IN_SHAKE_SMOOTHIE')) {
        userMessageNl =
          'Er staat vlees, kip of vis in een shake of smoothie. Dat is niet toegestaan; probeer opnieuw.';
      }
    }
    const userActionHints = (mapped?.userActionHints ?? []).slice(0, MAX_HINTS);
    let diagnostics = sanitizeDetails(error.details);
    // For generic codes, add actual message to diagnostics so admins see it in Technische details
    const genericCodesWithReason: (AppErrorCode | 'UNKNOWN')[] = [
      'DB_ERROR',
      'AGENT_ERROR',
      'INTERNAL',
    ];
    if (
      error.safeMessage &&
      genericCodesWithReason.includes(error.code as AppErrorCode)
    ) {
      const reason = error.safeMessage.substring(0, 500);
      diagnostics = { ...(diagnostics ?? {}), reason };
    }
    return {
      code: error.code,
      userMessageNl,
      userActionHints,
      ...(diagnostics &&
        Object.keys(diagnostics).length > 0 && { diagnostics }),
    };
  }
  const message =
    error instanceof Error
      ? error.message
      : 'Er ging iets mis bij het aanmaken van het weekmenu.';
  return {
    code: 'UNKNOWN',
    userMessageNl:
      message.includes('validation') || message.includes('Invalid')
        ? 'De invoer is ongeldig.'
        : 'Er ging iets mis bij het aanmaken van het weekmenu. Probeer opnieuw.',
    userActionHints: ['Probeer opnieuw.', 'Controleer je invoer.'],
  };
}
