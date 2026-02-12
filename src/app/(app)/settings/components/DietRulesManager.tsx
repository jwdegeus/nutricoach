'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  getDietRulesForAdmin,
  createDietRule,
  updateDietRule,
  deleteDietRule,
  type DietRuleInput,
  type DietRuleOutput,
} from '../actions/diet-rules-admin.actions';
import type { DietRuleType } from '@/src/app/(app)/onboarding/types/diet-rules.types';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { Textarea } from '@/components/catalyst/textarea';
import { Checkbox, CheckboxField } from '@/components/catalyst/checkbox';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';

type DietRulesManagerProps = {
  dietTypeId: string;
  dietTypeName: string;
};

export function DietRulesManager({
  dietTypeId,
  dietTypeName,
}: DietRulesManagerProps) {
  const [rules, setRules] = useState<DietRuleOutput[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [formData, setFormData] = useState<DietRuleInput>({
    dietTypeId,
    ruleType: 'exclude_ingredient',
    ruleKey: '',
    ruleValue: {},
    description: '',
    priority: 50,
    isActive: true,
  });

  useEffect(() => {
    if (expanded) {
      loadRules();
    }
  }, [expanded, dietTypeId]);

  async function loadRules() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getDietRulesForAdmin(dietTypeId);
      if ('error' in result) {
        setError(result.error);
      } else if (result.data) {
        setRules(result.data);
      }
    } catch (_err) {
      setError('Onverwachte fout bij laden regels');
    } finally {
      setIsLoading(false);
    }
  }

  function startEdit(rule: DietRuleOutput) {
    setFormData({
      dietTypeId: rule.dietTypeId,
      ruleType: rule.ruleType,
      ruleKey: rule.ruleKey,
      ruleValue: rule.ruleValue as DietRuleInput['ruleValue'],
      description: rule.description || '',
      priority: rule.priority,
      isActive: rule.isActive,
    });
    setEditingId(rule.id);
    setIsCreating(false);
    setError(null);
    setSuccess(null);
  }

  function startCreate() {
    setFormData({
      dietTypeId,
      ruleType: 'exclude_ingredient',
      ruleKey: '',
      ruleValue: {},
      description: '',
      priority: 50,
      isActive: true,
    });
    setEditingId(null);
    setIsCreating(true);
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setIsCreating(false);
    setFormData({
      dietTypeId,
      ruleType: 'exclude_ingredient',
      ruleKey: '',
      ruleValue: {},
      description: '',
      priority: 50,
      isActive: true,
    });
    setError(null);
    setSuccess(null);
  }

  function updateRuleValue(field: string, value: unknown) {
    setFormData({
      ...formData,
      ruleValue: {
        ...(formData.ruleValue as Record<string, unknown>),
        [field]: value,
      },
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.ruleKey.trim()) {
      setError('Regelkey is verplicht');
      return;
    }

    startTransition(async () => {
      try {
        let result;
        if (isCreating) {
          result = await createDietRule(formData);
        } else if (editingId) {
          result = await updateDietRule(editingId, formData);
        } else {
          setError('Geen actie geselecteerd');
          return;
        }

        if ('error' in result) {
          setError(result.error);
        } else {
          setSuccess(
            isCreating
              ? 'Regel succesvol aangemaakt'
              : 'Regel succesvol bijgewerkt',
          );
          cancelEdit();
          await loadRules();
        }
      } catch (_err) {
        setError('Onverwachte fout bij opslaan');
      }
    });
  }

  function handleDelete(id: string) {
    setDeleteRuleId(id);
    setShowDeleteDialog(true);
  }

  async function handleDeleteConfirm() {
    if (!deleteRuleId) return;

    setShowDeleteDialog(false);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const result = await deleteDietRule(deleteRuleId);
        if ('error' in result) {
          setError(result.error);
        } else {
          setSuccess('Regel succesvol verwijderd');
          await loadRules();
        }
      } catch (_err) {
        setError('Onverwachte fout bij verwijderen');
      } finally {
        setDeleteRuleId(null);
      }
    });
  }

  function renderRuleValueEditor() {
    const ruleType = formData.ruleType;
    const ruleValue = formData.ruleValue as Record<string, unknown>;

    switch (ruleType) {
      case 'exclude_ingredient': {
        const value = ruleValue as {
          excludedCategories?: string[];
          excludedIngredients?: string[];
        };
        return (
          <>
            <Field>
              <Label htmlFor="excludedCategories">
                Uitgesloten categorieën
              </Label>
              <Textarea
                id="excludedCategories"
                value={value.excludedCategories?.join(', ') || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'excludedCategories',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                rows={2}
                placeholder="Bijv. grains, dairy, legumes (gescheiden door komma's)"
              />
              <Description>
                Categorieën die uitgesloten moeten worden (gescheiden door
                komma&apos;s)
              </Description>
            </Field>
            <Field>
              <Label htmlFor="excludedIngredients">
                Uitgesloten ingrediënten
              </Label>
              <Textarea
                id="excludedIngredients"
                value={value.excludedIngredients?.join(', ') || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'excludedIngredients',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                rows={2}
                placeholder="Bijv. tomato, potato, gluten (gescheiden door komma's)"
              />
              <Description>
                Specifieke ingrediënten die uitgesloten moeten worden
              </Description>
            </Field>
          </>
        );
      }
      case 'require_ingredient': {
        const value = ruleValue as {
          requiredIngredients?: string[];
          frequency?: string;
          minimumAmount?: string | number;
          minAmountMl?: number;
          maxAmountMl?: number;
          recommendedIngredients?: string[];
          allowedSweeteners?: string[];
          forbiddenSweeteners?: string[];
        };
        return (
          <>
            <Field>
              <Label htmlFor="requiredIngredients">Vereiste ingrediënten</Label>
              <Textarea
                id="requiredIngredients"
                value={value.requiredIngredients?.join(', ') || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'requiredIngredients',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                rows={2}
                placeholder="Bijv. liver, heart, flaxseed_oil (gescheiden door komma's)"
              />
            </Field>
            <Field>
              <Label htmlFor="frequency">Frequentie</Label>
              <Listbox
                value={value.frequency || ''}
                onChange={(val) => updateRuleValue('frequency', val)}
                aria-label="Frequentie"
              >
                <ListboxOption value="">Geen</ListboxOption>
                <ListboxOption value="daily">Dagelijks</ListboxOption>
                <ListboxOption value="weekly">Wekelijks</ListboxOption>
                <ListboxOption value="2x_weekly">2x per week</ListboxOption>
                <ListboxOption value="monthly">Maandelijks</ListboxOption>
              </Listbox>
            </Field>
            <Field>
              <Label htmlFor="minAmountMl">Min hoeveelheid (ml)</Label>
              <Input
                id="minAmountMl"
                type="number"
                value={value.minAmountMl || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'minAmountMl',
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                placeholder="Bijv. 20"
              />
            </Field>
            <Field>
              <Label htmlFor="maxAmountMl">Max hoeveelheid (ml)</Label>
              <Input
                id="maxAmountMl"
                type="number"
                value={value.maxAmountMl || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'maxAmountMl',
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                placeholder="Bijv. 40"
              />
            </Field>
            <Field>
              <Label htmlFor="recommendedIngredients">
                Aanbevolen ingrediënten
              </Label>
              <Textarea
                id="recommendedIngredients"
                value={value.recommendedIngredients?.join(', ') || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'recommendedIngredients',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                rows={2}
                placeholder="Aanbevolen maar niet verplicht (gescheiden door komma's)"
              />
            </Field>
          </>
        );
      }
      case 'macro_constraint': {
        const value = ruleValue as {
          maxCarbsPer100g?: number;
          dailyCarbLimit?: number;
          maxSaturatedFatGrams?: number;
          allowedTypes?: string[];
          forbiddenTypes?: string[];
        };
        return (
          <>
            <Field>
              <Label htmlFor="maxCarbsPer100g">Max koolhydraten per 100g</Label>
              <Input
                id="maxCarbsPer100g"
                type="number"
                value={value.maxCarbsPer100g || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'maxCarbsPer100g',
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
              />
            </Field>
            <Field>
              <Label htmlFor="dailyCarbLimit">
                Dagelijkse koolhydraat limiet (g)
              </Label>
              <Input
                id="dailyCarbLimit"
                type="number"
                value={value.dailyCarbLimit || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'dailyCarbLimit',
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
              />
            </Field>
            <Field>
              <Label htmlFor="maxSaturatedFatGrams">
                Max verzadigd vet per dag (g)
              </Label>
              <Input
                id="maxSaturatedFatGrams"
                type="number"
                value={value.maxSaturatedFatGrams || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'maxSaturatedFatGrams',
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
              />
            </Field>
            <Field>
              <Label htmlFor="allowedTypes">Toegestane types</Label>
              <Textarea
                id="allowedTypes"
                value={value.allowedTypes?.join(', ') || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'allowedTypes',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                rows={2}
                placeholder="Bijv. monosaccharides (gescheiden door komma's)"
              />
            </Field>
            <Field>
              <Label htmlFor="forbiddenTypes">Verboden types</Label>
              <Textarea
                id="forbiddenTypes"
                value={value.forbiddenTypes?.join(', ') || ''}
                onChange={(e) =>
                  updateRuleValue(
                    'forbiddenTypes',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                rows={2}
                placeholder="Bijv. disaccharides, polysaccharides (gescheiden door komma's)"
              />
            </Field>
          </>
        );
      }
      case 'meal_structure': {
        const value = ruleValue as {
          vegetableCupsRequirement?: {
            totalCups: number;
            leafyCups: number;
            sulfurCups: number;
            coloredCups: number;
          };
          freshnessRequirement?: {
            maxLeftoverHours: number;
            meatRequirement: string;
          };
        };
        return (
          <>
            {value.vegetableCupsRequirement && (
              <>
                <Field>
                  <Label htmlFor="totalCups">
                    Totaal aantal koppen groente
                  </Label>
                  <Input
                    id="totalCups"
                    type="number"
                    value={value.vegetableCupsRequirement.totalCups || ''}
                    onChange={(e) =>
                      updateRuleValue('vegetableCupsRequirement', {
                        ...value.vegetableCupsRequirement,
                        totalCups: e.target.value
                          ? parseInt(e.target.value)
                          : 0,
                      })
                    }
                  />
                </Field>
                <Field>
                  <Label htmlFor="leafyCups">Bladgroenten koppen</Label>
                  <Input
                    id="leafyCups"
                    type="number"
                    value={value.vegetableCupsRequirement.leafyCups || ''}
                    onChange={(e) =>
                      updateRuleValue('vegetableCupsRequirement', {
                        ...value.vegetableCupsRequirement,
                        leafyCups: e.target.value
                          ? parseInt(e.target.value)
                          : 0,
                      })
                    }
                  />
                </Field>
                <Field>
                  <Label htmlFor="sulfurCups">
                    Zwavelrijke groenten koppen
                  </Label>
                  <Input
                    id="sulfurCups"
                    type="number"
                    value={value.vegetableCupsRequirement.sulfurCups || ''}
                    onChange={(e) =>
                      updateRuleValue('vegetableCupsRequirement', {
                        ...value.vegetableCupsRequirement,
                        sulfurCups: e.target.value
                          ? parseInt(e.target.value)
                          : 0,
                      })
                    }
                  />
                </Field>
                <Field>
                  <Label htmlFor="coloredCups">Gekleurde groenten koppen</Label>
                  <Input
                    id="coloredCups"
                    type="number"
                    value={value.vegetableCupsRequirement.coloredCups || ''}
                    onChange={(e) =>
                      updateRuleValue('vegetableCupsRequirement', {
                        ...value.vegetableCupsRequirement,
                        coloredCups: e.target.value
                          ? parseInt(e.target.value)
                          : 0,
                      })
                    }
                  />
                </Field>
              </>
            )}
            {value.freshnessRequirement && (
              <>
                <Field>
                  <Label htmlFor="maxLeftoverHours">Max restjes uren</Label>
                  <Input
                    id="maxLeftoverHours"
                    type="number"
                    value={value.freshnessRequirement.maxLeftoverHours || ''}
                    onChange={(e) =>
                      updateRuleValue('freshnessRequirement', {
                        ...value.freshnessRequirement,
                        maxLeftoverHours: e.target.value
                          ? parseInt(e.target.value)
                          : 0,
                      })
                    }
                  />
                </Field>
                <Field>
                  <Label htmlFor="meatRequirement">Vlees vereiste</Label>
                  <Listbox
                    value={value.freshnessRequirement.meatRequirement || ''}
                    onChange={(val) =>
                      updateRuleValue('freshnessRequirement', {
                        ...value.freshnessRequirement,
                        meatRequirement: val,
                      })
                    }
                    aria-label="Vlees vereiste"
                  >
                    <ListboxOption value="any">Elk</ListboxOption>
                    <ListboxOption value="fresh_or_flash_frozen">
                      Vers of diepvries
                    </ListboxOption>
                  </Listbox>
                </Field>
              </>
            )}
          </>
        );
      }
      default:
        return (
          <Field>
            <Label>Regelwaarde (JSON)</Label>
            <Textarea
              value={JSON.stringify(ruleValue, null, 2)}
              onChange={(e) => {
                try {
                  updateRuleValue('', JSON.parse(e.target.value));
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              rows={6}
            />
            <Description>Voer JSON in voor complexe regelwaarden</Description>
          </Field>
        );
    }
  }

  return (
    <>
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeleteRuleId(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Regel verwijderen"
        description="Weet je zeker dat je deze regel wilt verwijderen?"
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isPending}
      />
      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Text className="font-medium text-zinc-950 dark:text-white">
              Regels voor {dietTypeName}
            </Text>
            <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {rules.length} regel{rules.length !== 1 ? 's' : ''}
            </Text>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setExpanded(!expanded)} color="zinc">
              {expanded ? 'Verbergen' : 'Bekijken'}
            </Button>
            {expanded && !isCreating && !editingId && (
              <Button onClick={startCreate} className="text-sm">
                Nieuwe regel
              </Button>
            )}
          </div>
        </div>

        {expanded && (
          <>
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                <strong>Fout:</strong> {error}
              </div>
            )}

            {success && (
              <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
                <strong>Succes:</strong> {success}
              </div>
            )}

            {(isCreating || editingId) && (
              <form
                onSubmit={handleSubmit}
                className="mb-6 space-y-4 border-b border-zinc-200 pb-6 dark:border-zinc-800"
              >
                <FieldGroup>
                  <Field>
                    <Label htmlFor="ruleType">Regeltype *</Label>
                    <Listbox
                      value={formData.ruleType}
                      onChange={(val) =>
                        setFormData({
                          ...formData,
                          ruleType: val as DietRuleType,
                          ruleValue: {},
                        })
                      }
                      aria-label="Regeltype"
                    >
                      <ListboxOption value="exclude_ingredient">
                        Uitsluiten ingrediënt
                      </ListboxOption>
                      <ListboxOption value="require_ingredient">
                        Vereisen ingrediënt
                      </ListboxOption>
                      <ListboxOption value="macro_constraint">
                        Macro constraint
                      </ListboxOption>
                      <ListboxOption value="meal_structure">
                        Maaltijd structuur
                      </ListboxOption>
                    </Listbox>
                  </Field>

                  <Field>
                    <Label htmlFor="ruleKey">Regelkey *</Label>
                    <Input
                      id="ruleKey"
                      value={formData.ruleKey}
                      onChange={(e) =>
                        setFormData({ ...formData, ruleKey: e.target.value })
                      }
                      required
                      placeholder="Bijv. excluded_categories, daily_flaxseed_oil"
                    />
                    <Description>
                      Unieke identifier voor deze regel binnen dit dieettype
                    </Description>
                  </Field>

                  <Field>
                    <Label htmlFor="description">Beschrijving</Label>
                    <Textarea
                      id="description"
                      value={formData.description || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      rows={2}
                      placeholder="Human-readable beschrijving van de regel"
                    />
                  </Field>

                  <Field>
                    <Label htmlFor="priority">Prioriteit</Label>
                    <Input
                      id="priority"
                      type="number"
                      value={formData.priority}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          priority: parseInt(e.target.value) || 0,
                        })
                      }
                      min={0}
                      max={100}
                    />
                    <Description>
                      Hogere prioriteit = belangrijker (0-100, guard rails zijn
                      meestal 90+)
                    </Description>
                  </Field>

                  {renderRuleValueEditor()}

                  <CheckboxField>
                    <Checkbox
                      checked={formData.isActive ?? true}
                      onChange={(value) =>
                        setFormData({ ...formData, isActive: value })
                      }
                    />
                    <Label>Actief</Label>
                  </CheckboxField>

                  <div className="flex gap-2">
                    <Button type="submit" disabled={isPending}>
                      {isPending
                        ? 'Opslaan...'
                        : isCreating
                          ? 'Aanmaken'
                          : 'Bijwerken'}
                    </Button>
                    <Button type="button" onClick={cancelEdit} color="zinc">
                      Annuleren
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            )}

            {isLoading ? (
              <Text className="text-zinc-500 dark:text-zinc-400">
                Regels laden...
              </Text>
            ) : (
              <div className="space-y-2">
                {rules.length === 0 ? (
                  <Text className="text-zinc-500 dark:text-zinc-400">
                    Geen regels gevonden
                  </Text>
                ) : (
                  rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-start justify-between rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Text className="font-medium text-zinc-950 dark:text-white">
                            {rule.ruleType} / {rule.ruleKey}
                          </Text>
                          {!rule.isActive && (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              Inactief
                            </span>
                          )}
                          {rule.priority >= 90 && (
                            <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 dark:bg-red-950/50 dark:text-red-400">
                              Guard Rail
                            </span>
                          )}
                        </div>
                        {rule.description && (
                          <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                            {rule.description}
                          </Text>
                        )}
                        <Text className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                          Prioriteit: {rule.priority}
                        </Text>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400">
                            Regelwaarde bekijken
                          </summary>
                          <pre className="mt-2 overflow-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
                            {JSON.stringify(rule.ruleValue, null, 2)}
                          </pre>
                        </details>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => startEdit(rule)}
                          color="zinc"
                          disabled={editingId === rule.id || isCreating}
                        >
                          Bewerken
                        </Button>
                        <Button
                          onClick={() => handleDelete(rule.id)}
                          color="red"
                          disabled={isPending}
                        >
                          Verwijderen
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
