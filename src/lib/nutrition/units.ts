/**
 * Canonical unit strings for nutrient comparison (no numeric conversion).
 * Use for consistent comparison of unit labels (e.g. µg vs ug vs mcg).
 * Numeric conversion stays in mapping multiplier / convertToSourceUnit in scripts.
 */

/**
 * Canonicalize a unit string for comparison: deterministic, pure, no side effects.
 * - trim + lowercase
 * - Unicode micro: µ (U+00B5), μ (U+03BC) → u
 * - Aliases: mcg→ug; gram(s)→g; milligram(s)→mg; kcalorie(s)→kcal
 * Unknown units: return cleaned string (trim + lower + µ/μ→u).
 */
export function canonicalizeUnit(
  unit: string | null | undefined,
): string | null {
  if (unit == null || typeof unit !== 'string') return null;
  let s = unit.trim().toLowerCase();
  if (s === '') return null;
  s = s.replace(/\u00b5|\u03bc/g, 'u');
  const aliases: Record<string, string> = {
    mcg: 'ug',
    gram: 'g',
    grams: 'g',
    milligram: 'mg',
    milligrams: 'mg',
    kcalorie: 'kcal',
    kcalories: 'kcal',
  };
  return aliases[s] ?? s;
}
