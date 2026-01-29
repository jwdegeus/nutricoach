/**
 * Converteer recepthoeveelheid + eenheid naar gram voor nutri-berekening.
 * Recepteenheden worden niet gewijzigd; deze helper wordt alleen gebruikt
 * om voeding te berekenen (NEVO/custom zijn per 100g).
 *
 * Standaard conversies (Nederlandse en Engelse eenheden):
 * - g, gram: 1
 * - kg: 1000
 * - el, eetlepel, tbsp: 15 g
 * - tl, theelepel, tsp: 5 g
 * - ml: 1 (waterdichtheid)
 * - L, liter: 1000
 * - cup, kop: 240
 * - cl: 10
 * - mespuntje: 2
 * - snuf, snufje: 0.5
 * - stuks/stuk/stukje: 100 (fallback, gewicht onbekend)
 */
const UNIT_TO_GRAMS_PER_UNIT: Record<string, number> = {
  g: 1,
  gram: 1,
  grammen: 1,
  kg: 1000,
  kilo: 1000,
  el: 15,
  eetlepel: 15,
  eetlepels: 15,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  tl: 5,
  theelepel: 5,
  theelepels: 5,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  lit: 1000,
  cup: 240,
  kop: 240,
  kopje: 240,
  cups: 240,
  cl: 10,
  centiliter: 10,
  centiliters: 10,
  mespuntje: 2,
  mespunt: 2,
  snuf: 0.5,
  snufje: 0.5,
  snufjes: 0.5,
  stuks: 100,
  stuk: 100,
  stukje: 100,
  stukjes: 100,
  stukken: 100,
  teentje: 3,
  teentjes: 3,
  plak: 25,
  plakje: 25,
  plakjes: 25,
};

/**
 * Bepaal gram voor gegeven hoeveelheid en eenheid (voor nutri-berekening).
 * Bij onbekende eenheid wordt 1 eenheid = 100g gebruikt als fallback.
 */
export function quantityUnitToGrams(quantity: number, unit: string): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const u = (unit || 'g').toLowerCase().trim();
  const gramsPerUnit = UNIT_TO_GRAMS_PER_UNIT[u];
  if (gramsPerUnit != null) {
    return quantity * gramsPerUnit;
  }
  // Fallback: onbekende eenheid als 100g per eenheid (voorkomt 0 en houdt recept intact)
  return quantity * 100;
}
