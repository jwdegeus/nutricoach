'use client';

import { useState, useTransition, Fragment } from 'react';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Textarea } from '@/components/catalyst/textarea';
import { Fieldset, Label } from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/16/solid';
import { updateRecipeContentAction } from '../../actions/meals.actions';

type IngredientRow = {
  name: string;
  quantity?: string | number | null;
  unit?: string | null;
  note?: string | null;
  section?: string | null;
};

type InstructionRow = { step: number; text: string };

type RecipeContentEditorProps = {
  mealId: string;
  mealSource: 'custom' | 'gemini';
  /** Huidige ingrediënten (actieve versie) */
  ingredients: IngredientRow[];
  /** Huidige instructies (actieve versie) */
  instructions: InstructionRow[];
  /** Na succesvol opslaan; bij instructionsOnly wordt de opgeslagen instructies-array doorgegeven */
  onUpdated: (updatedInstructions?: InstructionRow[]) => void;
  /** Alleen bereidingsinstructies tonen (voor gebruik in het instructieblok) */
  instructionsOnly?: boolean;
  /** Bij annuleren (bijv. sluit dialog) */
  onCancel?: () => void;
  /** Start direct in bewerkmodus (bijv. wanneer geopend in een dialog) */
  defaultEditing?: boolean;
};

function instructionsFromAi(ai: unknown): InstructionRow[] {
  const o = ai as Record<string, unknown>;
  if (!o?.instructions) return [];
  const arr = Array.isArray(o.instructions) ? o.instructions : [];
  return arr.map((item: unknown, i: number) => {
    const it = item as Record<string, unknown>;
    return {
      step: typeof it?.step === 'number' ? it.step : i + 1,
      text:
        typeof item === 'string'
          ? item
          : String(it?.text ?? it?.step ?? it ?? ''),
    };
  });
}

function ingredientsFromMealData(mealData: unknown): IngredientRow[] {
  const o = mealData as Record<string, unknown>;
  const ing = o?.ingredients;
  if (!Array.isArray(ing) || ing.length === 0) return [];
  return ing.map((item: unknown) => {
    const it = item as Record<string, unknown>;
    const q = it.quantity ?? it.amount;
    const u = it.unit;
    const n = it.note ?? it.notes;
    const s = it.section;
    return {
      name: String(it.name ?? it.original_line ?? ''),
      quantity:
        q != null
          ? typeof q === 'number' || typeof q === 'string'
            ? q
            : null
          : null,
      unit: u != null ? String(u) : null,
      note: n != null ? String(n) : null,
      section: s != null ? String(s) : null,
    };
  });
}

export function RecipeContentEditor({
  mealId,
  mealSource,
  ingredients: initialIngredients,
  instructions: initialInstructions,
  onUpdated,
  instructionsOnly = false,
  onCancel: onCancelProp,
  defaultEditing = false,
}: RecipeContentEditorProps) {
  const [isEditing, setIsEditing] = useState(defaultEditing);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initialIngredients.length > 0
      ? initialIngredients
      : [{ name: '', quantity: null, unit: null, note: null }],
  );
  const [instructions, setInstructions] = useState<InstructionRow[]>(
    initialInstructions.length > 0
      ? initialInstructions
      : [{ step: 1, text: '' }],
  );

  const handleStartEdit = () => {
    setIngredients(
      initialIngredients.length > 0
        ? initialIngredients
        : [{ name: '', quantity: null, unit: null, note: null }],
    );
    setInstructions(
      initialInstructions.length > 0
        ? initialInstructions
        : [{ step: 1, text: '' }],
    );
    setError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    onCancelProp?.();
  };

  const handleSave = () => {
    setError(null);
    const cleanIng = ingredients.filter((i) => String(i.name ?? '').trim());
    const cleanInst = instructions
      .filter((i) => String(i.text ?? '').trim())
      .map((inst, idx) => ({ step: idx + 1, text: inst.text.trim() }));

    if (!instructionsOnly && cleanIng.length === 0) {
      setError('Minimaal één ingrediënt is verplicht');
      return;
    }
    if (cleanInst.length === 0) {
      setError('Minimaal één bereidingsinstructie is verplicht');
      return;
    }

    startTransition(async () => {
      const result = await updateRecipeContentAction({
        mealId,
        source: mealSource,
        ingredients: instructionsOnly
          ? initialIngredients.map((i) => ({
              name: String(i.name ?? '').trim(),
              quantity: i.quantity,
              unit: i.unit ?? null,
              note: i.note ?? null,
              section: i.section ?? null,
            }))
          : cleanIng.map((i) => ({
              name: i.name.trim(),
              quantity: i.quantity,
              unit: i.unit,
              note: i.note,
              section: i.section ?? null,
            })),
        instructions: cleanInst,
      });

      if (result.ok) {
        setIsEditing(false);
        onUpdated(instructionsOnly ? cleanInst : undefined);
      } else {
        setError(result.error.message);
      }
    });
  };

  const addIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { name: '', quantity: null, unit: null, note: null, section: null },
    ]);
  };

  const removeIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateIngredient = (
    index: number,
    field: keyof IngredientRow,
    value: string | number | null,
  ) => {
    setIngredients((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addInstruction = () => {
    setInstructions((prev) => [...prev, { step: prev.length + 1, text: '' }]);
  };

  const removeInstruction = (index: number) => {
    setInstructions((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((inst, i) => ({ ...inst, step: i + 1 })),
    );
  };

  const updateInstruction = (index: number, text: string) => {
    setInstructions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text };
      return next;
    });
  };

  if (!isEditing && !instructionsOnly) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-4">
        <Button outline onClick={handleStartEdit}>
          <PencilIcon className="h-4 w-4 mr-2" />
          Bewerk ingrediënten en bereiding
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
          {instructionsOnly ? 'Bewerk bereidingsinstructies' : 'Bewerk recept'}
        </h3>
        <div className="flex gap-2">
          <Button outline onClick={handleCancel} disabled={isPending}>
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
          <Text className="text-sm text-red-700 dark:text-red-300">
            {error}
          </Text>
        </div>
      )}

      {!instructionsOnly && (
        <Fieldset>
          <Label>Ingrediënten</Label>
          <div className="space-y-3 mt-2">
            {(() => {
              const hasSections = ingredients.some(
                (i) => i.section != null && String(i.section).trim() !== '',
              );
              if (!hasSections) {
                return (
                  <>
                    {ingredients.map((ing, idx) => (
                      <div
                        key={idx}
                        className="flex flex-wrap items-start gap-2"
                      >
                        <Input
                          placeholder="Naam"
                          value={ing.name ?? ''}
                          onChange={(e) =>
                            updateIngredient(idx, 'name', e.target.value)
                          }
                          className="flex-1 min-w-[120px]"
                        />
                        <Input
                          placeholder="Hoeveelheid"
                          value={ing.quantity ?? ''}
                          onChange={(e) =>
                            updateIngredient(
                              idx,
                              'quantity',
                              e.target.value || null,
                            )
                          }
                          className="w-24"
                        />
                        <Input
                          placeholder="Eenheid"
                          value={ing.unit ?? ''}
                          onChange={(e) =>
                            updateIngredient(
                              idx,
                              'unit',
                              e.target.value || null,
                            )
                          }
                          className="w-20"
                        />
                        <Input
                          placeholder="Opmerking"
                          value={ing.note ?? ''}
                          onChange={(e) =>
                            updateIngredient(
                              idx,
                              'note',
                              e.target.value || null,
                            )
                          }
                          className="flex-1 min-w-[100px]"
                        />
                        <button
                          type="button"
                          onClick={() => removeIngredient(idx)}
                          className="p-2 text-zinc-500 hover:text-red-600"
                          aria-label="Verwijderen"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </>
                );
              }
              const groups: { section: string | null; indices: number[] }[] =
                [];
              let curSection: string | null = null;
              let curIndices: number[] = [];
              for (let i = 0; i < ingredients.length; i++) {
                const s =
                  ingredients[i].section != null &&
                  String(ingredients[i].section).trim() !== ''
                    ? String(ingredients[i].section).trim()
                    : null;
                if (s !== curSection) {
                  if (curIndices.length > 0)
                    groups.push({ section: curSection, indices: curIndices });
                  curSection = s;
                  curIndices = [i];
                } else {
                  curIndices.push(i);
                }
              }
              if (curIndices.length > 0)
                groups.push({ section: curSection, indices: curIndices });

              return groups.map((group, gi) => (
                <Fragment key={gi}>
                  {group.section && (
                    <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 pt-2 first:pt-0">
                      {group.section}
                    </div>
                  )}
                  {group.indices.map((idx) => {
                    const ing = ingredients[idx];
                    return (
                      <div
                        key={idx}
                        className="flex flex-wrap items-start gap-2"
                      >
                        <Input
                          placeholder="Naam"
                          value={ing.name ?? ''}
                          onChange={(e) =>
                            updateIngredient(idx, 'name', e.target.value)
                          }
                          className="flex-1 min-w-[120px]"
                        />
                        <Input
                          placeholder="Hoeveelheid"
                          value={ing.quantity ?? ''}
                          onChange={(e) =>
                            updateIngredient(
                              idx,
                              'quantity',
                              e.target.value || null,
                            )
                          }
                          className="w-24"
                        />
                        <Input
                          placeholder="Eenheid"
                          value={ing.unit ?? ''}
                          onChange={(e) =>
                            updateIngredient(
                              idx,
                              'unit',
                              e.target.value || null,
                            )
                          }
                          className="w-20"
                        />
                        <Input
                          placeholder="Opmerking"
                          value={ing.note ?? ''}
                          onChange={(e) =>
                            updateIngredient(
                              idx,
                              'note',
                              e.target.value || null,
                            )
                          }
                          className="flex-1 min-w-[100px]"
                        />
                        <button
                          type="button"
                          onClick={() => removeIngredient(idx)}
                          className="p-2 text-zinc-500 hover:text-red-600"
                          aria-label="Verwijderen"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </Fragment>
              ));
            })()}
            <Button outline onClick={addIngredient} className="mt-1">
              <PlusIcon className="h-4 w-4 mr-1" />
              Ingrediënt toevoegen
            </Button>
          </div>
        </Fieldset>
      )}

      <Fieldset>
        <Label>Bereidingsinstructies</Label>
        <div className="space-y-3 mt-2">
          {instructions.map((inst, idx) => (
            <div key={idx} className="flex gap-2">
              <span className="flex-shrink-0 w-6 h-10 flex items-center text-sm text-zinc-500">
                {idx + 1}.
              </span>
              <Textarea
                placeholder={`Stap ${idx + 1}`}
                value={inst.text}
                onChange={(e) => updateInstruction(idx, e.target.value)}
                className="flex-1 min-h-[60px]"
                rows={2}
              />
              <button
                type="button"
                onClick={() => removeInstruction(idx)}
                className="p-2 text-zinc-500 hover:text-red-600 flex-shrink-0"
                aria-label="Verwijderen"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button outline onClick={addInstruction} className="mt-1">
            <PlusIcon className="h-4 w-4 mr-1" />
            Stap toevoegen
          </Button>
        </div>
      </Fieldset>
    </div>
  );
}

export function getIngredientsForEditor(mealData: unknown): IngredientRow[] {
  return ingredientsFromMealData(mealData);
}

export function getInstructionsForEditor(
  aiAnalysis: unknown,
): InstructionRow[] {
  return instructionsFromAi(aiAnalysis);
}
