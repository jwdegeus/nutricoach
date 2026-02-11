'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Field, Label } from '@/components/catalyst/fieldset';
import {
  Listbox,
  ListboxOption,
  ListboxLabel,
} from '@/components/catalyst/listbox';
import {
  CUSTOM_FOODS_SECTIONS,
  ALL_CUSTOM_FOOD_KEYS,
} from '../custom/custom-foods-fields';
import { suggestIngredientEnrichmentAction } from '../custom/actions/ingredient-enrich.actions';
import { getIngredientCategoriesAction } from '@/src/app/(app)/settings/actions/ingredient-categories-admin.actions';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import { CheckIcon, SparklesIcon, TrashIcon } from '@heroicons/react/20/solid';

const NUMERIC_KEYS = new Set([
  'energy_kj',
  'energy_kcal',
  'water_g',
  'protein_g',
  'protein_pl_g',
  'protein_drl_g',
  'nitrogen_g',
  'tryptophan_mg',
  'fat_g',
  'fatty_acids_g',
  'saturated_fat_g',
  'monounsaturated_fat_g',
  'polyunsaturated_fat_g',
  'omega3_fat_g',
  'omega6_fat_g',
  'trans_fat_g',
  'carbs_g',
  'sugar_g',
  'free_sugars_g',
  'starch_g',
  'polyols_g',
  'fiber_g',
  'alcohol_g',
  'organic_acids_g',
  'ash_g',
  'cholesterol_mg',
  'sodium_mg',
  'potassium_mg',
  'calcium_mg',
  'phosphorus_mg',
  'magnesium_mg',
  'iron_mg',
  'iron_haem_mg',
  'iron_non_haem_mg',
  'copper_mg',
  'selenium_ug',
  'zinc_mg',
  'iodine_ug',
  'vit_a_rae_ug',
  'vit_a_re_ug',
  'retinol_ug',
  'beta_carotene_total_ug',
  'alpha_carotene_ug',
  'lutein_ug',
  'zeaxanthin_ug',
  'beta_cryptoxanthin_ug',
  'lycopene_ug',
  'vit_d_ug',
  'vit_d3_ug',
  'vit_d2_ug',
  'vit_e_mg',
  'alpha_tocopherol_mg',
  'beta_tocopherol_mg',
  'delta_tocopherol_mg',
  'gamma_tocopherol_mg',
  'vit_k_ug',
  'vit_k1_ug',
  'vit_k2_ug',
  'vit_b1_mg',
  'vit_b2_mg',
  'vit_b6_mg',
  'vit_b12_ug',
  'niacin_equiv_mg',
  'niacin_mg',
  'folate_equiv_ug',
  'folate_ug',
  'folic_acid_ug',
  'vit_c_mg',
]);

type Source = 'nevo' | 'custom' | 'fndds_survey';

/** API path segment: fndds_survey uses route /api/.../fndds/[id]. */
function apiSegmentForSource(source: Source): string {
  return source === 'fndds_survey' ? 'fndds' : source;
}

type IngredientEditFormProps = {
  source: Source;
  id: string;
  initialData: Record<string, unknown>;
  showEnrich?: boolean;
};

function toFormValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return String(v);
}

function buildFormState(
  initial: Record<string, unknown>,
): Record<string, string> {
  const state: Record<string, string> = {};
  for (const key of ALL_CUSTOM_FOOD_KEYS) {
    state[key] = toFormValue(initial[key]);
  }
  return state;
}

export function IngredientEditForm({
  source,
  id,
  initialData,
  showEnrich = false,
}: IngredientEditFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>(() =>
    buildFormState(initialData),
  );
  const [foodGroups, setFoodGroups] = useState<{ nl: string; en: string }[]>(
    [],
  );
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [ingredientCategories, setIngredientCategories] = useState<
    Array<{ id: string; name_nl: string; name_en: string | null }>
  >([]);
  const [fnddsFoodGroups, setFnddsFoodGroups] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [fnddsGroupsLoading, setFnddsGroupsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/ingredients/food-groups');
        const json = await res.json();
        if (json.ok && json.data?.groups && !cancelled) {
          setFoodGroups(json.data.groups);
        }
      } finally {
        if (!cancelled) setGroupsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (source !== 'custom') return;
    let cancelled = false;
    setCategoriesLoading(true);
    getIngredientCategoriesAction()
      .then((result) => {
        if (!cancelled && result.ok && result.data) {
          const active = result.data.filter((c) => c.is_active);
          setIngredientCategories(
            active.map((c) => ({
              id: c.id,
              name_nl: c.name_nl,
              name_en: c.name_en,
            })),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    if (source !== 'custom') return;
    let cancelled = false;
    setFnddsGroupsLoading(true);
    fetch('/api/admin/ingredients/fndds-food-groups')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.ok && json.data?.groups) {
          setFnddsFoodGroups(json.data.groups);
        }
      })
      .finally(() => {
        if (!cancelled) setFnddsGroupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const groupOptions = useMemo(() => {
    const currentNl = form.food_group_nl?.trim() ?? '';
    const currentEn = form.food_group_en?.trim() ?? '';
    const hasCurrent = currentNl || currentEn;
    const inList = foodGroups.some((g) => g.nl === currentNl);
    if (hasCurrent && !inList) {
      return [{ nl: currentNl, en: currentEn || currentNl }, ...foodGroups];
    }
    return foodGroups;
  }, [foodGroups, form.food_group_nl, form.food_group_en]);

  const updateField = useCallback((key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
    setEnrichError(null);
  }, []);

  const formAsRecord = useCallback((): Record<
    string,
    string | number | null
  > => {
    const out: Record<string, string | number | null> = {};
    for (const key of ALL_CUSTOM_FOOD_KEYS) {
      const v = form[key] ?? '';
      const trimmed = typeof v === 'string' ? v.trim() : '';
      if (trimmed === '') {
        out[key] = null;
      } else if (NUMERIC_KEYS.has(key)) {
        const num = parseFloat(trimmed);
        out[key] = Number.isFinite(num) ? num : null;
      } else {
        out[key] = trimmed;
      }
    }
    return out;
  }, [form]);

  const handleEnrich = useCallback(async () => {
    setEnriching(true);
    setEnrichError(null);
    try {
      const current = formAsRecord();
      const result = await suggestIngredientEnrichmentAction(current);
      if (!result.ok) {
        setEnrichError(result.error);
        return;
      }
      setForm((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(result.suggested)) {
          if (!ALL_CUSTOM_FOOD_KEYS.includes(key)) continue;
          const existing = prev[key]?.trim() ?? '';
          if (existing === '' && value != null) {
            next[key] = typeof value === 'number' ? String(value) : value;
          }
        }
        return next;
      });
    } finally {
      setEnriching(false);
    }
  }, [formAsRecord]);

  const handleSave = useCallback(async () => {
    const nameNl = form.name_nl?.trim();
    if (!nameNl) {
      setSaveError('Naam (NL) is verplicht');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body = formAsRecord();
      const segment = apiSegmentForSource(source);
      const res = await fetch(`/api/admin/ingredients/${segment}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message ?? 'Opslaan mislukt');
      }
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }, [source, id, form, formAsRecord, router]);

  const handleDeleteConfirm = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const segment = apiSegmentForSource(source);
      const res = await fetch(`/api/admin/ingredients/${segment}/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message ?? 'Verwijderen mislukt');
      }
      setDeleteOpen(false);
      router.push('/admin/ingredients');
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Verwijderen mislukt',
      );
    } finally {
      setDeleting(false);
    }
  }, [source, id, router]);

  const algemeenBaseFields = CUSTOM_FOODS_SECTIONS[0].fields.filter(
    (f) =>
      f.key !== 'food_group_nl' &&
      f.key !== 'food_group_en' &&
      f.key !== 'ingredient_category_id' &&
      f.key !== 'fndds_food_group_nl',
  );
  const algemeenFieldsWithGroup =
    source === 'custom'
      ? [
          ...algemeenBaseFields.slice(0, 3),
          {
            key: 'ingredient_category_id',
            label: 'Ingredientgroep',
            type: 'text' as const,
          },
          {
            key: 'fndds_food_group_nl',
            label: 'FNDDS categorie',
            type: 'text' as const,
          },
          {
            key: 'food_group',
            label: 'Groep (NEVO)',
            type: 'text' as const,
          },
          ...algemeenBaseFields.slice(3),
        ]
      : [
          ...algemeenBaseFields.slice(0, 3),
          {
            key: 'food_group',
            label: 'Groep (NEVO)',
            type: 'text' as const,
          },
          ...algemeenBaseFields.slice(3),
        ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {showEnrich && (
          <Button
            plain
            onClick={handleEnrich}
            disabled={enriching}
            className="inline-flex items-center gap-2"
          >
            <SparklesIcon
              className={`h-5 w-5 ${enriching ? 'animate-pulse' : ''}`}
            />
            {enriching ? 'Analyseren...' : 'AI verrijken'}
          </Button>
        )}
        <Button onClick={handleSave} disabled={saving}>
          <CheckIcon className="mr-1 h-5 w-5" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </Button>
      </div>

      {(saveError || enrichError) && (
        <div
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
          role="alert"
        >
          {saveError ?? enrichError}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {CUSTOM_FOODS_SECTIONS.map((section, _sectionIndex) => {
          const isAlgemeen = section.title === 'Algemeen';
          const fields = isAlgemeen ? algemeenFieldsWithGroup : section.fields;

          return (
            <section
              key={section.title}
              className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                {section.title}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map((field) => {
                  if (
                    field.key === 'ingredient_category_id' &&
                    source === 'custom'
                  ) {
                    return (
                      <Field key="ingredient_category_id">
                        <Label>Ingredientgroep</Label>
                        <Listbox
                          value={form.ingredient_category_id ?? ''}
                          onChange={(id) => {
                            updateField('ingredient_category_id', id ?? '');
                            const cat = ingredientCategories.find(
                              (c) => c.id === id,
                            );
                            if (cat) {
                              updateField('food_group_nl', cat.name_nl);
                              updateField(
                                'food_group_en',
                                cat.name_en ?? cat.name_nl,
                              );
                            }
                          }}
                          disabled={categoriesLoading}
                          placeholder={
                            categoriesLoading
                              ? 'Laden...'
                              : '— Kies een ingredientgroep'
                          }
                          aria-label="Kies een ingredientgroep"
                        >
                          <ListboxOption value="">
                            <ListboxLabel>
                              — Kies een ingredientgroep
                            </ListboxLabel>
                          </ListboxOption>
                          {ingredientCategories.map((c) => (
                            <ListboxOption key={c.id} value={c.id}>
                              <ListboxLabel>{c.name_nl}</ListboxLabel>
                            </ListboxOption>
                          ))}
                        </Listbox>
                      </Field>
                    );
                  }
                  if (
                    field.key === 'fndds_food_group_nl' &&
                    source === 'custom'
                  ) {
                    return (
                      <Field key="fndds_food_group_nl">
                        <Label>FNDDS categorie</Label>
                        <Listbox
                          value={form.fndds_food_group_nl ?? ''}
                          onChange={(nl) =>
                            updateField('fndds_food_group_nl', nl ?? '')
                          }
                          disabled={fnddsGroupsLoading}
                          placeholder={
                            fnddsGroupsLoading
                              ? 'Laden...'
                              : '— Kies een FNDDS categorie'
                          }
                          aria-label="Kies een FNDDS categorie"
                        >
                          <ListboxOption value="">
                            <ListboxLabel>
                              — Kies een FNDDS categorie
                            </ListboxLabel>
                          </ListboxOption>
                          {fnddsFoodGroups.map((g) => (
                            <ListboxOption key={g} value={g}>
                              <ListboxLabel>{g}</ListboxLabel>
                            </ListboxOption>
                          ))}
                        </Listbox>
                      </Field>
                    );
                  }
                  if (field.key === 'food_group') {
                    return (
                      <Field key="food_group">
                        <Label>Groep (NEVO)</Label>
                        <Listbox
                          value={form.food_group_nl ?? ''}
                          onChange={(nl) => {
                            const opt = groupOptions.find((g) => g.nl === nl);
                            updateField('food_group_nl', nl ?? '');
                            updateField('food_group_en', opt?.en ?? nl ?? '');
                          }}
                          disabled={groupsLoading}
                          placeholder={
                            groupsLoading ? 'Laden...' : '— Kies een groep'
                          }
                          aria-label="Kies een groep"
                        >
                          <ListboxOption value="">
                            <ListboxLabel>— Kies een groep</ListboxLabel>
                          </ListboxOption>
                          {groupOptions.map((g) => (
                            <ListboxOption key={g.nl} value={g.nl}>
                              <ListboxLabel>{g.nl}</ListboxLabel>
                            </ListboxOption>
                          ))}
                        </Listbox>
                      </Field>
                    );
                  }
                  const config = section.fields.find(
                    (f) => f.key === field.key,
                  );
                  const type = config?.type ?? 'text';
                  return (
                    <Field key={field.key}>
                      <Label>{field.label}</Label>
                      <Input
                        type={type === 'number' ? 'number' : 'text'}
                        step={type === 'number' ? '0.01' : undefined}
                        value={form[field.key] ?? ''}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        placeholder={config?.placeholder}
                      />
                    </Field>
                  );
                })}
              </div>
            </section>
          );
        })}

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
            Gevaarzone
          </h2>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Verwijder dit ingrediënt permanent. Deze actie kan niet ongedaan
            worden gemaakt.
          </p>
          <Button
            outline={true}
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            <TrashIcon className="mr-1 h-5 w-5" />
            Ingrediënt verwijderen
          </Button>
        </section>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Ingrediënt verwijderen"
        description="Weet je zeker dat je dit ingrediënt wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt."
        confirmLabel="Verwijderen"
        confirmColor="red"
        isLoading={deleting}
        error={deleteError}
      />
    </>
  );
}
