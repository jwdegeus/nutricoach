/**
 * Diet Logic (Dieetregels) - Type definitions
 *
 * Diet Logic bepaalt per ingredientgroep: DROP (blokkeren), FORCE (verplicht),
 * LIMIT (beperkt), PASS (toegestaan). Zie docs/diet-logic-plan.md.
 */

/** Diet Logic actie: P0 drop, P1 force, P2 limit, P3 pass */
export type DietLogic = 'drop' | 'force' | 'limit' | 'pass';

/** Priority nummer voor sortering (P0=0 … P3=3) */
export const DIET_LOGIC_PRIORITY: Record<DietLogic, number> = {
  drop: 0,
  force: 1,
  limit: 2,
  pass: 3,
};

/** Label per Diet Logic (voor Dieetregels UI) – Nederlandse vertalingen */
export const DIET_LOGIC_LABELS: Record<
  DietLogic,
  { name: string; action: string; description: string }
> = {
  drop: {
    name: 'DROP (Geblokkeerd)',
    action: 'Verwijder',
    description:
      'Als een item in een geblokkeerde categorie zit voor het gekozen niveau → Maaltijd/recept ongeldig.',
  },
  force: {
    name: 'FORCE (Verplicht)',
    action: 'Verplicht',
    description:
      'AI moet een ingrediënt uit deze groep selecteren om aan het dag-quotum te voldoen.',
  },
  limit: {
    name: 'LIMIT (Beperkt)',
    action: 'Beperk',
    description:
      'AI mag dit gebruiken, maar met een harde limiet (bijv. max 1x per dag of x gram).',
  },
  pass: {
    name: 'PASS (Toegestaan)',
    action: 'Optioneel',
    description: 'Vrije invulling op basis van caloriebehoefte en smaak.',
  },
};

/** Prioriteit: 1 = hoogst, 65500 = laagst. Bij conflict wint de regel met de laagste priority-waarde. */
export type DietLogicConstraint = {
  id: string;
  dietTypeId: string;
  dietLogic: DietLogic;
  categoryCode: string;
  categoryNameNl: string;
  /** Termen + synoniemen waarop gematcht wordt (lowercase) */
  terms: string[];
  minPerDay: number | null;
  minPerWeek: number | null;
  maxPerDay: number | null;
  maxPerWeek: number | null;
  strictness: 'hard' | 'soft';
  isActive: boolean;
  /** 1 = hoogst, 65500 = laagst. Gebruikt voor conflictresolutie wanneer één ingrediënt onder meerdere regels valt. */
  priority: number;
};

/** Volledige set Dieetregels voor één diet_type (na laden + eventueel is_inflamed) */
export type DietLogicRuleset = {
  dietTypeId: string;
  constraints: DietLogicConstraint[];
  /** Groepering op diet_logic voor eenvoudige evaluatie */
  byLogic: {
    drop: DietLogicConstraint[];
    force: DietLogicConstraint[];
    limit: DietLogicConstraint[];
    pass: DietLogicConstraint[];
  };
};

/** Ingredient zoals gebruikt in evaluatie (naam voor matching, optioneel hoeveelheid) */
export type DietLogicIngredient = {
  name: string;
  amountG?: number;
  /** Optioneel: voor porties/cups bijvoorbeeld */
  portions?: number;
};

/** Context voor evaluateDietLogic */
export type DietLogicContext = {
  dietTypeId: string;
  /** Als true: nightshade-categorie wordt aan DROP toegevoegd */
  isInflamed?: boolean;
  /** Datum voor eventuele week-scope (force/limit per week) */
  date?: string;
};

/** Doelwit voor evaluatie: bv. ingrediënten van één recept of één dag */
export type DietLogicTargets = {
  ingredients: DietLogicIngredient[];
  /** Optioneel:zelfde ingrediënten gegroepeerd per maaltijd voor quotum-berekening */
  perDay?: boolean;
};

/** Resultaat van één fase */
export type DietLogicPhaseResult = {
  phase: 1 | 2 | 3 | 4;
  ok: boolean;
  violations: string[];
  /** Soft-overtredingen (waarschuwing, fase niet gefaald) */
  warnings?: string[];
  /** Fase 2: welke FORCE-quota nog niet gehaald */
  forceDeficits?: Array<{
    categoryCode: string;
    categoryNameNl: string;
    minPerDay?: number;
    minPerWeek?: number;
  }>;
  /** Fase 3: welke LIMIT-overschrijdingen */
  limitExcesses?: Array<{
    categoryCode: string;
    categoryNameNl: string;
    actual: number;
    maxPerDay?: number;
    maxPerWeek?: number;
  }>;
};

/** Resultaat van evaluateDietLogic */
export type DietLogicEvaluationResult = {
  ok: boolean;
  /** Eerste fase die faalde (1=DROP, 2=FORCE, 3=LIMIT). 4 = alleen info. */
  failedPhase: 1 | 2 | 3 | 4 | null;
  phaseResults: DietLogicPhaseResult[];
  /** Samenvatting voor UI/LLM */
  summary: string;
  /** Waarschuwingen bij soft striktheid (maaltijd niet geblokkeerd, wel melden) */
  warnings?: string[];
};
