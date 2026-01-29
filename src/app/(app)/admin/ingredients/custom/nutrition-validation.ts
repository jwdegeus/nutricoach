/**
 * Validatie en correctie van voedingswaarden per 100g voor custom_foods.
 * Waarden zijn in de eenheid van het veld (bijv. sodium_mg = milligram per 100g; keukenzout ≈ 38758 mg).
 */

/** Maximale plausibele waarden per 100g per veldtype (eenheid in veldnaam). */
const MAX_PER_100G: Record<string, number> = {
  // _g: max 100 (100% van 100g)
  energy_kj: 5000,
  energy_kcal: 1000,
  water_g: 100,
  protein_g: 100,
  fat_g: 100,
  carbs_g: 100,
  fiber_g: 100,
  sugar_g: 100,
  saturated_fat_g: 100,
  cholesterol_mg: 1000,
  // Natrium in mg per 100g: keukenzout ≈ 38758 mg
  sodium_mg: 50_000,
  potassium_mg: 5000,
  calcium_mg: 3000,
  phosphorus_mg: 3000,
  magnesium_mg: 1000,
  iron_mg: 500,
  copper_mg: 100,
  zinc_mg: 100,
  // _ug: hogere getallen toegestaan
  selenium_ug: 1000,
  iodine_ug: 5000,
  vit_a_rae_ug: 50000,
  vit_c_mg: 500,
  vit_d_ug: 500,
  vit_e_mg: 500,
  vit_k_ug: 2000,
  vit_b1_mg: 100,
  vit_b2_mg: 100,
  vit_b6_mg: 100,
  vit_b12_ug: 500,
  niacin_mg: 100,
  folate_ug: 5000,
};

const DEFAULT_MAX_MG = 10_000;
const DEFAULT_MAX_G = 100;
const DEFAULT_MAX_UG = 100_000;

function getMaxForKey(key: string): number {
  if (MAX_PER_100G[key] != null) return MAX_PER_100G[key];
  if (key.endsWith('_mg')) return DEFAULT_MAX_MG;
  if (key.endsWith('_g')) return DEFAULT_MAX_G;
  if (key.endsWith('_ug')) return DEFAULT_MAX_UG;
  return 1_000_000;
}

/**
 * Corrigeert veelvoorkomende AI-fout: waarde in verkeerde schaal voor _mg/_ug (niet voor sodium_mg; die is in mg).
 * - overige *_mg: als >= 10000 → delen door 1000 (bij twijfel over eenheid)
 * - *_ug: als >= 1_000_000 → delen door 1000
 */
export function correctNutritionValue(key: string, value: number): number {
  if (!Number.isFinite(value)) return value;
  if (key === 'sodium_mg') return value;
  if (key.endsWith('_mg') && value >= 10_000) {
    return value / 1000;
  }
  if (key.endsWith('_ug') && value >= 1_000_000) {
    return value / 1000;
  }
  return value;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Controleert of een voedingswaarde per 100g binnen plausibele grenzen ligt.
 */
export function validateNutritionValue(
  key: string,
  value: number,
): ValidationResult {
  if (!Number.isFinite(value)) {
    return { valid: false, error: `Ongeldige waarde voor ${key}` };
  }
  if (value < 0) {
    return { valid: false, error: `${key} mag niet negatief zijn` };
  }
  const max = getMaxForKey(key);
  if (value > max) {
    return {
      valid: false,
      error: `${key} per 100g mag maximaal ${max} zijn (ontvangen: ${value})`,
    };
  }
  return { valid: true };
}

/**
 * Corrigeert en valideert een voedingswaarde. Gebruik bij AI-output of gebruikersinput.
 */
export function correctAndValidateNutritionValue(
  key: string,
  value: number,
): { value: number; validation: ValidationResult } {
  const corrected = correctNutritionValue(key, value);
  const validation = validateNutritionValue(key, corrected);
  return { value: corrected, validation };
}

/**
 * Past correctie toe op alle numerieke velden in een record (voor AI-suggesties of API body).
 */
export function correctNutritionValues(
  data: Record<string, unknown>,
  numericKeys: Set<string>,
): Record<string, unknown> {
  const out = { ...data };
  for (const key of numericKeys) {
    const v = out[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = correctNutritionValue(key, v);
    }
  }
  return out;
}

/**
 * Valideert alle numerieke voedingswaarden in een record. Retourneert de eerste fout.
 */
export function validateNutritionValues(
  data: Record<string, unknown>,
  numericKeys: Set<string>,
): ValidationResult {
  for (const key of numericKeys) {
    const v = data[key];
    if (v != null && typeof v === 'number') {
      const result = validateNutritionValue(key, v);
      if (!result.valid) return result;
    }
  }
  return { valid: true };
}
