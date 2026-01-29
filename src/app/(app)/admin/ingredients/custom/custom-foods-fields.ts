/**
 * Veldconfiguratie voor custom_foods: secties en labels voor bewerkformulier en AI-verrijking.
 * Komt overeen met de kolommen in custom_foods (zie migratie 20260202000000_custom_foods.sql).
 */

export type CustomFoodFieldType = 'text' | 'number';

export type CustomFoodFieldConfig = {
  key: string;
  label: string;
  type: CustomFoodFieldType;
  /** Optioneel: placeholder of eenheid (bijv. "per 100g") */
  placeholder?: string;
};

export const CUSTOM_FOODS_SECTIONS: {
  title: string;
  fields: CustomFoodFieldConfig[];
}[] = [
  {
    title: 'Algemeen',
    fields: [
      {
        key: 'name_nl',
        label: 'Naam (NL)',
        type: 'text',
        placeholder: 'Verplicht',
      },
      { key: 'name_en', label: 'Naam (EN)', type: 'text' },
      { key: 'synonym', label: 'Synoniem', type: 'text' },
      {
        key: 'food_group_nl',
        label: 'Groep (NL)',
        type: 'text',
        placeholder: 'bijv. Diversen',
      },
      {
        key: 'food_group_en',
        label: 'Groep (EN)',
        type: 'text',
        placeholder: 'bijv. Other',
      },
      {
        key: 'quantity',
        label: 'Hoeveelheid',
        type: 'text',
        placeholder: 'per 100g',
      },
      { key: 'note', label: 'Opmerking', type: 'text' },
      { key: 'contains_traces_of', label: 'Bevat sporen van', type: 'text' },
      { key: 'is_fortified_with', label: 'Verrijkt met', type: 'text' },
    ],
  },
  {
    title: 'Energie en macronutriënten',
    fields: [
      { key: 'energy_kj', label: 'Energie (kJ)', type: 'number' },
      { key: 'energy_kcal', label: 'Energie (kcal)', type: 'number' },
      { key: 'water_g', label: 'Water (g)', type: 'number' },
      { key: 'protein_g', label: 'Eiwit (g)', type: 'number' },
      { key: 'protein_pl_g', label: 'Eiwit PL (g)', type: 'number' },
      { key: 'protein_drl_g', label: 'Eiwit DRL (g)', type: 'number' },
      { key: 'nitrogen_g', label: 'Stikstof (g)', type: 'number' },
      { key: 'tryptophan_mg', label: 'Tryptofaan (mg)', type: 'number' },
      { key: 'fat_g', label: 'Vet (g)', type: 'number' },
      { key: 'fatty_acids_g', label: 'Vetzuren (g)', type: 'number' },
      { key: 'carbs_g', label: 'Koolhydraten (g)', type: 'number' },
      { key: 'sugar_g', label: 'Suiker (g)', type: 'number' },
      { key: 'free_sugars_g', label: 'Vrije suikers (g)', type: 'number' },
      { key: 'starch_g', label: 'Zetmeel (g)', type: 'number' },
      { key: 'polyols_g', label: 'Polyolen (g)', type: 'number' },
      { key: 'fiber_g', label: 'Vezel (g)', type: 'number' },
      { key: 'alcohol_g', label: 'Alcohol (g)', type: 'number' },
      { key: 'organic_acids_g', label: 'Organische zuren (g)', type: 'number' },
      { key: 'ash_g', label: 'As (g)', type: 'number' },
    ],
  },
  {
    title: 'Vetten',
    fields: [
      { key: 'saturated_fat_g', label: 'Verzadigd vet (g)', type: 'number' },
      {
        key: 'monounsaturated_fat_g',
        label: 'Enkelv. onverz. vet (g)',
        type: 'number',
      },
      {
        key: 'polyunsaturated_fat_g',
        label: 'Meerv. onverz. vet (g)',
        type: 'number',
      },
      { key: 'omega3_fat_g', label: 'Omega-3 (g)', type: 'number' },
      { key: 'omega6_fat_g', label: 'Omega-6 (g)', type: 'number' },
      { key: 'trans_fat_g', label: 'Transvet (g)', type: 'number' },
      { key: 'cholesterol_mg', label: 'Cholesterol (mg)', type: 'number' },
    ],
  },
  {
    title: 'Mineralen en spoorelementen',
    fields: [
      { key: 'sodium_mg', label: 'Natrium (mg)', type: 'number' },
      { key: 'potassium_mg', label: 'Kalium (mg)', type: 'number' },
      { key: 'calcium_mg', label: 'Calcium (mg)', type: 'number' },
      { key: 'phosphorus_mg', label: 'Fosfor (mg)', type: 'number' },
      { key: 'magnesium_mg', label: 'Magnesium (mg)', type: 'number' },
      { key: 'iron_mg', label: 'IJzer (mg)', type: 'number' },
      { key: 'iron_haem_mg', label: 'IJzer haem (mg)', type: 'number' },
      { key: 'iron_non_haem_mg', label: 'IJzer non-haem (mg)', type: 'number' },
      { key: 'copper_mg', label: 'Koper (mg)', type: 'number' },
      { key: 'selenium_ug', label: 'Selenium (µg)', type: 'number' },
      { key: 'zinc_mg', label: 'Zink (mg)', type: 'number' },
      { key: 'iodine_ug', label: 'Jodium (µg)', type: 'number' },
    ],
  },
  {
    title: 'Vitamines (vetoplosbaar)',
    fields: [
      { key: 'vit_a_rae_ug', label: 'Vit. A RAE (µg)', type: 'number' },
      { key: 'vit_a_re_ug', label: 'Vit. A RE (µg)', type: 'number' },
      { key: 'retinol_ug', label: 'Retinol (µg)', type: 'number' },
      {
        key: 'beta_carotene_total_ug',
        label: 'Bètacaroteen totaal (µg)',
        type: 'number',
      },
      { key: 'alpha_carotene_ug', label: 'Alfacaroteen (µg)', type: 'number' },
      { key: 'lutein_ug', label: 'Luteïne (µg)', type: 'number' },
      { key: 'zeaxanthin_ug', label: 'Zeaxanthine (µg)', type: 'number' },
      {
        key: 'beta_cryptoxanthin_ug',
        label: 'Bètacryptoxanthine (µg)',
        type: 'number',
      },
      { key: 'lycopene_ug', label: 'Lycopeen (µg)', type: 'number' },
      { key: 'vit_d_ug', label: 'Vit. D (µg)', type: 'number' },
      { key: 'vit_d3_ug', label: 'Vit. D3 (µg)', type: 'number' },
      { key: 'vit_d2_ug', label: 'Vit. D2 (µg)', type: 'number' },
      { key: 'vit_e_mg', label: 'Vit. E (mg)', type: 'number' },
      {
        key: 'alpha_tocopherol_mg',
        label: 'Alfatocoferol (mg)',
        type: 'number',
      },
      {
        key: 'beta_tocopherol_mg',
        label: 'Bètatocoferol (mg)',
        type: 'number',
      },
      {
        key: 'delta_tocopherol_mg',
        label: 'Deltatocoferol (mg)',
        type: 'number',
      },
      {
        key: 'gamma_tocopherol_mg',
        label: 'Gammatocoferol (mg)',
        type: 'number',
      },
      { key: 'vit_k_ug', label: 'Vit. K (µg)', type: 'number' },
      { key: 'vit_k1_ug', label: 'Vit. K1 (µg)', type: 'number' },
      { key: 'vit_k2_ug', label: 'Vit. K2 (µg)', type: 'number' },
    ],
  },
  {
    title: 'Vitamines (wateroplosbaar)',
    fields: [
      { key: 'vit_b1_mg', label: 'Vit. B1 (mg)', type: 'number' },
      { key: 'vit_b2_mg', label: 'Vit. B2 (mg)', type: 'number' },
      { key: 'vit_b6_mg', label: 'Vit. B6 (mg)', type: 'number' },
      { key: 'vit_b12_ug', label: 'Vit. B12 (µg)', type: 'number' },
      { key: 'niacin_equiv_mg', label: 'Niacine equiv. (mg)', type: 'number' },
      { key: 'niacin_mg', label: 'Niacine (mg)', type: 'number' },
      { key: 'folate_equiv_ug', label: 'Folaat equiv. (µg)', type: 'number' },
      { key: 'folate_ug', label: 'Folaat (µg)', type: 'number' },
      { key: 'folic_acid_ug', label: 'Foliumzuur (µg)', type: 'number' },
      { key: 'vit_c_mg', label: 'Vit. C (mg)', type: 'number' },
    ],
  },
];

/** Alle veldsleutels (excl. id, created_at, updated_at) voor type Record<string, string | number | null>. */
export const ALL_CUSTOM_FOOD_KEYS = CUSTOM_FOODS_SECTIONS.flatMap((s) =>
  s.fields.map((f) => f.key),
);

/** Sleutels van velden met numeriek type (voor correcte parsing van AI-output). */
export const NUMERIC_CUSTOM_FOOD_KEYS = new Set(
  CUSTOM_FOODS_SECTIONS.flatMap((s) =>
    s.fields.filter((f) => f.type === 'number').map((f) => f.key),
  ),
);
