/**
 * Gedeelde logica voor lookup in recipe_ingredient_matches.
 * Zelfde meervoudige varianten als getResolvedIngredientMatchesAction op de detailpagina,
 * zodat de overview (meal-list, meal-recent) matches vindt ongeacht hoe ze zijn opgeslagen.
 */

function normalizeIngredientText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

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
  'eetlepels',
  'theelepel',
  'theelepels',
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
 * Korte zoekterm uit ingrediëntregel (zonder hoeveelheid/eenheid).
 * Bijv. "1/2 theelepel paprikapoeder" → "paprikapoeder"
 */
function extractIngredientSearchTerm(fullLine: string): string {
  let s = fullLine.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!s) return '';

  s = s.replace(/^[\d\s\-.,]+(g\s*)?/i, '').trim();
  const leadingWords = s.split(/\s+/);
  while (
    leadingWords.length > 0 &&
    UNIT_AND_STOP.has(leadingWords[0]!.toLowerCase())
  ) {
    leadingWords.shift();
    s = leadingWords.join(' ').trim();
  }
  s = s.replace(/\s*(per\s+)?\d+\s*g\s*$/i, '').trim();
  s = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (!s) return fullLine.trim().slice(0, 50);

  const words = s.split(/\s+/).filter((w) => w.length > 0);
  const take = Math.min(words.length, 4);
  const kernel = words.slice(0, take).join(' ');
  return kernel.length > 0 ? kernel : s.slice(0, 50);
}

/**
 * Genereer alle genormaliseerde varianten voor lookup in recipe_ingredient_matches.
 * Matches kunnen zijn opgeslagen met de volledige regel ("2 el olijfolie") OF
 * de korte vorm ("olijfolie"). Beide worden geprobeerd.
 */
export function getNormalizedVariantsForMatchLookup(ing: {
  name?: string;
  original_line?: string;
}): string[] {
  const raw = String(ing.name ?? ing.original_line ?? '').trim();
  if (!raw) return [];

  const variants: string[] = [];
  const norm = normalizeIngredientText(raw);
  if (norm) variants.push(norm);

  const short = extractIngredientSearchTerm(raw);
  if (short) {
    const normShort = normalizeIngredientText(short);
    if (normShort && !variants.includes(normShort)) variants.push(normShort);
  }

  const origLine = String(ing.original_line ?? '').trim();
  if (origLine && origLine !== raw) {
    const normOrig = normalizeIngredientText(origLine);
    if (normOrig && !variants.includes(normOrig)) variants.push(normOrig);
    const shortOrig = extractIngredientSearchTerm(origLine);
    if (shortOrig) {
      const normShortOrig = normalizeIngredientText(shortOrig);
      if (normShortOrig && !variants.includes(normShortOrig))
        variants.push(normShortOrig);
    }
  }

  return variants;
}
