'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Select } from '@/components/catalyst/select';
import {
  CUSTOM_FOODS_SECTIONS,
  ALL_CUSTOM_FOOD_KEYS,
} from '../custom/custom-foods-fields';
import { suggestIngredientEnrichmentAction } from '../custom/actions/ingredient-enrich.actions';
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

type Source = 'nevo' | 'custom';

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
      const res = await fetch(`/api/admin/ingredients/${source}/${id}`, {
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
      const res = await fetch(`/api/admin/ingredients/${source}/${id}`, {
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

  const algemeenFieldsWithoutGroup = CUSTOM_FOODS_SECTIONS[0].fields.filter(
    (f) => f.key !== 'food_group_nl' && f.key !== 'food_group_en',
  );

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
          <CheckIcon className="h-5 w-5 mr-1" />
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

      <div className="mt-8 space-y-10">
        {CUSTOM_FOODS_SECTIONS.map((section, sectionIndex) => {
          const isAlgemeen = section.title === 'Algemeen';
          const fields = isAlgemeen
            ? [
                ...algemeenFieldsWithoutGroup.slice(0, 3),
                {
                  key: 'food_group',
                  label: 'Groep (NEVO)',
                  type: 'text' as const,
                },
                ...algemeenFieldsWithoutGroup.slice(3),
              ]
            : section.fields;

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
                  if (field.key === 'food_group') {
                    return (
                      <Field key="food_group">
                        <Label>Groep (NEVO)</Label>
                        <Select
                          value={form.food_group_nl ?? ''}
                          onChange={(e) => {
                            const nl = e.target.value;
                            const opt = groupOptions.find((g) => g.nl === nl);
                            updateField('food_group_nl', nl);
                            updateField('food_group_en', opt?.en ?? nl);
                          }}
                          disabled={groupsLoading}
                        >
                          <option value="">
                            {groupsLoading ? 'Laden...' : '— Kies een groep'}
                          </option>
                          {groupOptions.map((g) => (
                            <option key={g.nl} value={g.nl}>
                              {g.nl}
                            </option>
                          ))}
                        </Select>
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
            <TrashIcon className="h-5 w-5 mr-1" />
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
