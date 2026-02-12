/**
 * Normalize ingredient text that has quantity, unit, and name combined into one string.
 *
 * Examples:
 *   "1/2 theelepel kurkumapoeder" → { quantity: 0.5, unit: "tl", name: "kurkumapoeder" }
 *   "1 eetlepel oregano" → { quantity: 1, unit: "el", name: "oregano" }
 *   "2 tbl olijfolie" → { quantity: 2, unit: "el", name: "olijfolie" }
 *   "450 g kipfilet" → { quantity: 450, unit: "g", name: "kipfilet" }
 *
 * Returns null when no quantity+unit pattern is found.
 */

/** Known units and their normalized form (Dutch/metric). */
const UNIT_ALIASES: Record<string, string> = {
  // Teaspoons
  theelepel: 'tl',
  theelepels: 'tl',
  theelepeltje: 'tl',
  tl: 'tl',
  tsp: 'tl',
  tspn: 'tl',
  't.': 'tl',
  t: 'tl',
  // Tablespoons
  eetlepel: 'el',
  eetlepels: 'el',
  eetlepeltje: 'el',
  el: 'el',
  tablespoon: 'el',
  tablespoons: 'el',
  tbsp: 'el',
  tbl: 'el',
  tbs: 'el',
  'T.': 'el',
  // Weight
  gram: 'g',
  grammen: 'g',
  g: 'g',
  kilogram: 'kg',
  kilo: 'kg',
  kg: 'kg',
  ounce: 'g',
  oz: 'g',
  pound: 'g',
  lb: 'g',
  lbs: 'g',
  // Volume
  milliliter: 'ml',
  milliliters: 'ml',
  ml: 'ml',
  liter: 'ml',
  literes: 'ml',
  l: 'ml',
  deciliter: 'ml',
  dl: 'ml',
  cup: 'ml',
  cups: 'ml',
  kopje: 'ml',
  kopjes: 'ml',
  // Pieces
  stuk: 'stuk',
  stuks: 'stuk',
  stukken: 'stuk',
  piece: 'stuk',
  pieces: 'stuk',
  pk: 'stuk',
  puntje: 'stuk',
  teentje: 'stuk',
  teentjes: 'stuk',
  plak: 'stuk',
  plakken: 'stuk',
  bol: 'stuk',
  bollen: 'stuk',
  stronk: 'stuk',
  stronken: 'stuk',
  takje: 'stuk',
  takjes: 'stuk',
  blokje: 'stuk',
  blokjes: 'stuk',
};

function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim();
  return UNIT_ALIASES[lower] ?? lower;
}

/** Parse quantity string: supports "1/2", "¼", "2 1/2", "2,5", "15" */
function parseQuantity(str: string): number | null {
  const s = str.trim();
  if (!s) return null;

  // Unicode fractions
  const fractionMap: Record<string, number> = {
    '½': 0.5,
    '¼': 0.25,
    '¾': 0.75,
    '⅓': 0.333,
    '⅔': 0.667,
    '⅛': 0.125,
    '⅜': 0.375,
    '⅝': 0.625,
    '⅞': 0.875,
  };
  if (fractionMap[s] !== undefined) return fractionMap[s]!;

  // ASCII fraction: 1/2, 1/4, 3/4, etc.
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1]!, 10);
    const den = parseInt(fracMatch[2]!, 10);
    if (den > 0) return num / den;
  }

  // Mixed: "2 1/2", "1 1/4"
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1]!, 10);
    const num = parseInt(mixedMatch[2]!, 10);
    const den = parseInt(mixedMatch[3]!, 10);
    if (den > 0) return whole + num / den;
  }

  // Decimal: 2.5, 2,5
  const cleaned = s.replace(',', '.');
  const num = parseFloat(cleaned);
  return !isNaN(num) && num > 0 ? num : null;
}

export type NormalizedIngredient = {
  quantity: number;
  unit: string;
  name: string;
};

/**
 * Try to parse "quantity unit name" from combined text.
 * Returns null if no parseable pattern is found.
 */
export function normalizeIngredientFromCombinedText(
  text: string,
): NormalizedIngredient | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Strip optional note in parentheses at the end
  const noteMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)$/);
  const mainPart = noteMatch ? noteMatch[1]!.trim() : trimmed;

  // Build unit pattern: known Dutch/English units (word chars)
  const unitPattern =
    '(?:(?:theelepel|eetlepel|theelepels|eetlepels)|' +
    'tbl|tbs|tbsp|tsp|el|tl|' +
    'gram|grammen|kilogram|kilo|g|kg|' +
    'milliliter|liter|deciliter|ml|dl|l|' +
    'stuk|stuks|stukken|teentje|teentjes|plak|plakken|blokje|blokjes|' +
    'kopje|kopjes|cup|cups|' +
    'ounce|oz|pound|lb|lbs|' +
    '[a-zA-Z]{1,4})';

  // Pattern 1: "1/2 theelepel kurkumapoeder" or "1 eetlepel oregano" or "450 g kip"
  const qtyUnitNameRe = new RegExp(
    `^([\\d\\s½¼¾⅓⅔⅛⅜⅝⅞/.,]+)\\s+${unitPattern}\\s+(.+)$`,
    'i',
  );
  const m1 = mainPart.match(qtyUnitNameRe);
  if (m1) {
    const qty = parseQuantity(m1[1]!);
    if (qty != null) {
      return {
        quantity: qty,
        unit: normalizeUnit(m1[2]!),
        name: m1[3]!.trim(),
      };
    }
  }

  // Pattern 2: "theelepel kurkumapoeder" (unit + name, no quantity → qty 1)
  const unitNameRe = new RegExp(`^${unitPattern}\\s+(.+)$`, 'i');
  const m2 = mainPart.match(unitNameRe);
  if (m2) {
    return {
      quantity: 1,
      unit: normalizeUnit(m2[1]!),
      name: m2[2]!.trim(),
    };
  }

  return null;
}

/**
 * Normalize an ingredient object. If quantity/unit are empty but name looks
 * like "qty unit name", parse and split. Otherwise return ingredient unchanged.
 */
export function normalizeIngredient<
  T extends { name: string; quantity?: number | null; unit?: string | null },
>(ing: T, options?: { useOriginalLine?: boolean }): T {
  const hasQty = ing.quantity != null && ing.quantity > 0;
  const hasUnit = ing.unit != null && ing.unit.trim() !== '';

  if (hasQty && hasUnit) {
    return ing;
  }

  const textToParse =
    options?.useOriginalLine &&
    'original_line' in ing &&
    typeof (ing as { original_line?: string }).original_line === 'string'
      ? (ing as { original_line: string }).original_line
      : ing.name;

  const parsed = normalizeIngredientFromCombinedText(textToParse);
  if (!parsed) return ing;

  return {
    ...ing,
    quantity: parsed.quantity,
    unit: parsed.unit,
    name: parsed.name,
  };
}
