'use client';

import { Fragment } from 'react';
import {
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
} from '@/components/catalyst/description-list';

export type DetailFood = Record<string, unknown> & {
  source?: 'nevo' | 'custom';
};

const SKIP_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'source',
  'nevo_code',
  'nevo_version',
  'created_by',
]);

const GROUPS: { title: string; keys: string[] }[] = [
  {
    title: 'Algemeen',
    keys: [
      'name_nl',
      'name_en',
      'synonym',
      'food_group_nl',
      'food_group_en',
      'quantity',
      'note',
      'contains_traces_of',
      'is_fortified_with',
    ],
  },
  {
    title: 'Energie en macronutriënten',
    keys: [
      'energy_kj',
      'energy_kcal',
      'water_g',
      'protein_g',
      'fat_g',
      'carbs_g',
      'sugar_g',
      'fiber_g',
      'starch_g',
      'alcohol_g',
    ],
  },
  {
    title: 'Vetten',
    keys: [
      'saturated_fat_g',
      'monounsaturated_fat_g',
      'polyunsaturated_fat_g',
      'omega3_fat_g',
      'omega6_fat_g',
      'trans_fat_g',
      'cholesterol_mg',
    ],
  },
  {
    title: 'Mineralen',
    keys: [
      'sodium_mg',
      'potassium_mg',
      'calcium_mg',
      'phosphorus_mg',
      'magnesium_mg',
      'iron_mg',
      'zinc_mg',
      'copper_mg',
      'selenium_ug',
      'iodine_ug',
    ],
  },
  {
    title: 'Vitamines',
    keys: [
      'vit_a_rae_ug',
      'vit_d_ug',
      'vit_e_mg',
      'vit_k_ug',
      'vit_b1_mg',
      'vit_b2_mg',
      'vit_b6_mg',
      'vit_b12_ug',
      'niacin_equiv_mg',
      'folate_equiv_ug',
      'vit_c_mg',
    ],
  },
];

const LABEL_MAP: Record<string, string> = {
  name_nl: 'Naam (NL)',
  name_en: 'Naam (EN)',
  synonym: 'Synoniem',
  food_group_nl: 'Groep (NL)',
  food_group_en: 'Groep (EN)',
  quantity: 'Hoeveelheid',
  note: 'Opmerking',
  contains_traces_of: 'Bevat sporen van',
  is_fortified_with: 'Verrijkt met',
  energy_kj: 'Energie (kJ)',
  energy_kcal: 'Energie (kcal)',
  water_g: 'Water (g)',
  protein_g: 'Eiwit (g)',
  fat_g: 'Vet (g)',
  carbs_g: 'Koolhydraten (g)',
  sugar_g: 'Suiker (g)',
  fiber_g: 'Vezel (g)',
  starch_g: 'Zetmeel (g)',
  alcohol_g: 'Alcohol (g)',
  saturated_fat_g: 'Verzadigd vet (g)',
  monounsaturated_fat_g: 'Enkelv. onverz. vet (g)',
  polyunsaturated_fat_g: 'Meerv. onverz. vet (g)',
  omega3_fat_g: 'Omega-3 (g)',
  omega6_fat_g: 'Omega-6 (g)',
  trans_fat_g: 'Transvet (g)',
  cholesterol_mg: 'Cholesterol (mg)',
  sodium_mg: 'Natrium (mg)',
  potassium_mg: 'Kalium (mg)',
  calcium_mg: 'Calcium (mg)',
  phosphorus_mg: 'Fosfor (mg)',
  magnesium_mg: 'Magnesium (mg)',
  iron_mg: 'IJzer (mg)',
  zinc_mg: 'Zink (mg)',
  copper_mg: 'Koper (mg)',
  selenium_ug: 'Selenium (µg)',
  iodine_ug: 'Jodium (µg)',
  vit_a_rae_ug: 'Vit. A RAE (µg)',
  vit_d_ug: 'Vit. D (µg)',
  vit_e_mg: 'Vit. E (mg)',
  vit_k_ug: 'Vit. K (µg)',
  vit_b1_mg: 'Vit. B1 (mg)',
  vit_b2_mg: 'Vit. B2 (mg)',
  vit_b6_mg: 'Vit. B6 (mg)',
  vit_b12_ug: 'Vit. B12 (µg)',
  niacin_equiv_mg: 'Niacine equiv. (mg)',
  folate_equiv_ug: 'Folaat equiv. (µg)',
  vit_c_mg: 'Vit. C (mg)',
};

export function IngredientDetailView({ item }: { item: DetailFood }) {
  return (
    <div className="max-h-[70vh] space-y-6 overflow-y-auto">
      {GROUPS.map((group) => {
        const entries = group.keys
          .filter((k) => k in item && !SKIP_KEYS.has(k))
          .map((k) => {
            const v = item[k];
            const display =
              v == null
                ? '–'
                : typeof v === 'number'
                  ? Number.isNaN(v)
                    ? '–'
                    : String(v)
                  : String(v);
            return { key: k, label: LABEL_MAP[k] ?? k, value: display };
          })
          .filter((e) => e.value !== '–' || e.key.includes('name'));
        if (entries.length === 0) return null;
        return (
          <div key={group.title}>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {group.title}
            </h3>
            <DescriptionList>
              {entries.map(({ key, label, value }) => (
                <Fragment key={key}>
                  <DescriptionTerm>{label}</DescriptionTerm>
                  <DescriptionDetails>{value}</DescriptionDetails>
                </Fragment>
              ))}
            </DescriptionList>
          </div>
        );
      })}
    </div>
  );
}
