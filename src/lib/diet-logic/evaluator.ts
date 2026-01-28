/**
 * Diet Logic (Dieetregels) - Evaluator
 *
 * Evalueert ingrediënten tegen Dieetregels in 4 fases:
 * Fase 1 DROP → Fase 2 FORCE-quotum → Fase 3 LIMIT → Fase 4 PASS (informatief).
 *
 * Conflictresolutie: als één ingrediënt onder meerdere regels valt (bv. wahls_colored + nightshades),
 * wint de regel met de hoogste prioriteit (laagste priority-waarde). Striktheid: Streng (hard) =
 * maaltijd afkeuren; Zacht (soft) = waarschuwing, maaltijd niet blokkeren.
 */

import type {
  DietLogicRuleset,
  DietLogicConstraint,
  DietLogicIngredient,
  DietLogicTargets,
  DietLogicEvaluationResult,
  DietLogicPhaseResult,
} from './types';

/**
 * Genereert genormaliseerde vormen van een ingredientnaam voor matching.
 * Slug-varianten (organ_meats, wahls_organ_meat) en meervoud/enkelvoud worden
 * meegenomen zodat ze matchen met primaire terms uit ingredient_category_items.
 */
function normaliseIngredientNameForMatching(name: string): string[] {
  const raw = name.trim().toLowerCase();
  if (!raw) return [];
  const forms = new Set<string>([raw]);
  const withSpaces = raw.replace(/_/g, ' ');
  forms.add(withSpaces);
  const withoutTrailingS = withSpaces.replace(/\s+s$/i, '');
  if (withoutTrailingS !== withSpaces) forms.add(withoutTrailingS);
  return Array.from(forms);
}

/** Controleert of een ingredientnaam matcht met één van de termen van een constraint */
function ingredientMatchesConstraint(name: string, terms: string[]): boolean {
  const candidates = normaliseIngredientNameForMatching(name);
  if (candidates.length === 0) return false;
  for (const n of candidates) {
    for (const t of terms) {
      if (!t) continue;
      const termForms = [t, t.replace(/_/g, ' ')];
      for (const tNorm of termForms) {
        if (n === tNorm || n.includes(tNorm) || tNorm.includes(n)) return true;
        const tokens = n.split(/\s+/);
        for (const tok of tokens) {
          if (tok === tNorm || tok.includes(tNorm) || tNorm.includes(tok))
            return true;
        }
      }
    }
  }
  return false;
}

/**
 * Bepaalt per ingrediënt de "winnende" regel (eerste match in prioriteitsvolgorde).
 * Alle regels zijn gesorteerd op priority ASC (1 = hoogst).
 */
function winningConstraintForIngredient(
  ingredientName: string,
  allByPriority: DietLogicConstraint[],
): DietLogicConstraint | null {
  for (const c of allByPriority) {
    if (ingredientMatchesConstraint(ingredientName, c.terms)) return c;
  }
  return null;
}

/**
 * Evalueert ingrediënten tegen een Diet Logic ruleset (Dieetregels).
 * Fase 1: DROP – bij een match (na conflictresolutie) is het resultaat ongeldig of waarschuwing (bij soft).
 * Fase 2: FORCE – controleert of aan min_per_day / min_per_week is voldaan (telt alleen ingrediënten waar deze regel wint).
 * Fase 3: LIMIT – controleert of max niet overschreden is; bij soft alleen waarschuwing.
 * Fase 4: PASS – geen harde check.
 */
export function evaluateDietLogic(
  ruleset: DietLogicRuleset,
  targets: DietLogicTargets,
): DietLogicEvaluationResult {
  const ingredients = targets.ingredients ?? [];
  const phaseResults: DietLogicPhaseResult[] = [];
  const allWarnings: string[] = [];
  let failedPhase: 1 | 2 | 3 | 4 | null = null;
  const summaryParts: string[] = [];

  // Alle regels op prioriteit (1=hoogst eerst) voor conflictresolutie
  const allByPriority = [...ruleset.constraints].sort(
    (a, b) => (a.priority ?? 50) - (b.priority ?? 50),
  );

  // ---------- Fase 1: DROP (na conflictresolutie) ----------
  const dropViolations: string[] = [];
  const dropWarnings: string[] = [];
  for (const ing of ingredients) {
    const winner = winningConstraintForIngredient(ing.name, allByPriority);
    if (winner?.dietLogic !== 'drop') continue;
    const msg = `${ing.name} hoort bij "${winner.categoryNameNl}" (DROP – niet toegestaan)`;
    if (winner.strictness === 'hard') {
      dropViolations.push(msg);
    } else {
      dropWarnings.push(msg);
    }
  }
  const phase1Ok = dropViolations.length === 0;
  phaseResults.push({
    phase: 1,
    ok: phase1Ok,
    violations: dropViolations,
    warnings: dropWarnings.length > 0 ? dropWarnings : undefined,
  });
  if (dropWarnings.length) allWarnings.push(...dropWarnings);
  if (!phase1Ok) {
    failedPhase = 1;
    summaryParts.push(`Fase 1 DROP: ${dropViolations.length} overtreding(en).`);
    return {
      ok: false,
      failedPhase: 1,
      phaseResults,
      summary: summaryParts.join(' '),
      warnings: allWarnings.length ? allWarnings : undefined,
    };
  }

  // ---------- Fase 2: FORCE (tel alleen ingrediënten waar deze FORCE-regel wint) ----------
  const forceDeficits: DietLogicPhaseResult['forceDeficits'] = [];
  for (const constraint of ruleset.byLogic.force) {
    const count = ingredients.filter(
      (ing) =>
        winningConstraintForIngredient(ing.name, allByPriority)?.id ===
        constraint.id,
    ).length;
    const minDay = constraint.minPerDay ?? 0;
    const minWeek = constraint.minPerWeek ?? 0;
    const required = minDay > 0 ? minDay : minWeek;
    if (required > 0 && count < required) {
      forceDeficits.push({
        categoryCode: constraint.categoryCode,
        categoryNameNl: constraint.categoryNameNl,
        minPerDay: constraint.minPerDay ?? undefined,
        minPerWeek: constraint.minPerWeek ?? undefined,
      });
    }
  }
  const phase2Ok = forceDeficits.length === 0;
  phaseResults.push({
    phase: 2,
    ok: phase2Ok,
    violations: phase2Ok
      ? []
      : forceDeficits.map(
          (d) =>
            `Te weinig uit "${d.categoryNameNl}" (FORCE-quotum niet gehaald)`,
        ),
    forceDeficits: phase2Ok ? undefined : forceDeficits,
  });
  if (!phase2Ok) {
    failedPhase = 2;
    summaryParts.push(
      `Fase 2 FORCE: quotum niet gehaald voor ${forceDeficits.length} categorie(ën).`,
    );
    return {
      ok: false,
      failedPhase: 2,
      phaseResults,
      summary: summaryParts.join(' '),
      warnings: allWarnings.length ? allWarnings : undefined,
    };
  }

  // ---------- Fase 3: LIMIT (tel alleen waar deze LIMIT-regel wint; soft = waarschuwing) ----------
  const limitViolations: string[] = [];
  const limitWarnings: string[] = [];
  const limitExcesses: DietLogicPhaseResult['limitExcesses'] = [];
  for (const constraint of ruleset.byLogic.limit) {
    const count = ingredients.filter(
      (ing) =>
        winningConstraintForIngredient(ing.name, allByPriority)?.id ===
        constraint.id,
    ).length;
    const maxDay = constraint.maxPerDay ?? Infinity;
    const maxWeek = constraint.maxPerWeek ?? Infinity;
    const limit = maxDay < Infinity ? maxDay : maxWeek;
    if (limit < Infinity && count > limit) {
      const excess = {
        categoryCode: constraint.categoryCode,
        categoryNameNl: constraint.categoryNameNl,
        actual: count,
        maxPerDay: constraint.maxPerDay ?? undefined,
        maxPerWeek: constraint.maxPerWeek ?? undefined,
      };
      limitExcesses.push(excess);
      const msg = `"${constraint.categoryNameNl}": ${count} gebruikt, max ${constraint.maxPerDay ?? constraint.maxPerWeek}`;
      if (constraint.strictness === 'hard') {
        limitViolations.push(msg);
      } else {
        limitWarnings.push(msg);
      }
    }
  }
  const phase3Ok = limitViolations.length === 0;
  if (limitWarnings.length) allWarnings.push(...limitWarnings);
  phaseResults.push({
    phase: 3,
    ok: phase3Ok,
    violations: limitViolations,
    warnings: limitWarnings.length > 0 ? limitWarnings : undefined,
    limitExcesses: limitExcesses.length > 0 ? limitExcesses : undefined,
  });
  if (!phase3Ok) {
    failedPhase = 3;
    summaryParts.push(
      `Fase 3 LIMIT: overschrijding voor ${limitViolations.length} categorie(ën).`,
    );
    return {
      ok: false,
      failedPhase: 3,
      phaseResults,
      summary: summaryParts.join(' '),
      warnings: allWarnings.length ? allWarnings : undefined,
    };
  }

  // ---------- Fase 4: PASS ----------
  phaseResults.push({
    phase: 4,
    ok: true,
    violations: [],
  });

  return {
    ok: true,
    failedPhase: null,
    phaseResults,
    summary: 'Dieetregels (Diet Logic): alle fases geslaagd.',
    warnings: allWarnings.length ? allWarnings : undefined,
  };
}
