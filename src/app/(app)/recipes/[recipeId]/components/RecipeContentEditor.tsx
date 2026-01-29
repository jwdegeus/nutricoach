'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Textarea } from '@/components/catalyst/textarea';
import { Field, Fieldset, Label } from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/16/solid';
import { updateRecipeContentAction } from '../../actions/meals.actions';

type IngredientRow = {
  name: string;
  quantity?: string | number | null;
  unit?: string | null;
  note?: string | null;
};

type InstructionRow = { step: number; text: string };

type RecipeContentEditorProps = {
  mealId: string;
  mealSource: 'custom' | 'gemini';
  /** Huidige ingrediënten (actieve versie) */
  ingredients: IngredientRow[];
  /** Huidige instructies (actieve versie) */
  instructions: InstructionRow[];
  onUpdated: () => void;
};

function instructionsFromAi(ai: any): InstructionRow[] {
  if (!ai?.instructions) return [];
  const arr = Array.isArray(ai.instructions) ? ai.instructions : [];
  return arr.map((item: any, i: number) => ({
    step: typeof item?.step === 'number' ? item.step : i + 1,
    text:
      typeof item === 'string'
        ? item
        : (item?.text ?? item?.step ?? String(item ?? '')),
  }));
}

function ingredientsFromMealData(mealData: any): IngredientRow[] {
  const ing = mealData?.ingredients;
  if (!Array.isArray(ing) || ing.length === 0) return [];
  return ing.map((item: any) => ({
    name: item.name ?? item.original_line ?? '',
    quantity: item.quantity ?? item.amount ?? null,
    unit: item.unit ?? null,
    note: item.note ?? item.notes ?? null,
  }));
}

export function RecipeContentEditor({
  mealId,
  mealSource,
  ingredients: initialIngredients,
  instructions: initialInstructions,
  onUpdated,
}: RecipeContentEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
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
  };

  const handleSave = () => {
    setError(null);
    const cleanIng = ingredients.filter((i) => String(i.name ?? '').trim());
    const cleanInst = instructions
      .filter((i) => String(i.text ?? '').trim())
      .map((inst, idx) => ({ step: idx + 1, text: inst.text.trim() }));

    if (cleanIng.length === 0) {
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
        ingredients: cleanIng.map((i) => ({
          name: i.name.trim(),
          quantity: i.quantity,
          unit: i.unit,
          note: i.note,
        })),
        instructions: cleanInst,
      });

      if (result.ok) {
        setIsEditing(false);
        onUpdated();
      } else {
        setError(result.error.message);
      }
    });
  };

  const addIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { name: '', quantity: null, unit: null, note: null },
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

  if (!isEditing) {
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
          Bewerk recept
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

      <Fieldset>
        <Label>Ingrediënten</Label>
        <div className="space-y-3 mt-2">
          {ingredients.map((ing, idx) => (
            <div key={idx} className="flex flex-wrap items-start gap-2">
              <Input
                placeholder="Naam"
                value={ing.name ?? ''}
                onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                className="flex-1 min-w-[120px]"
              />
              <Input
                placeholder="Hoeveelheid"
                value={ing.quantity ?? ''}
                onChange={(e) =>
                  updateIngredient(idx, 'quantity', e.target.value || null)
                }
                className="w-24"
              />
              <Input
                placeholder="Eenheid"
                value={ing.unit ?? ''}
                onChange={(e) =>
                  updateIngredient(idx, 'unit', e.target.value || null)
                }
                className="w-20"
              />
              <Input
                placeholder="Opmerking"
                value={ing.note ?? ''}
                onChange={(e) =>
                  updateIngredient(idx, 'note', e.target.value || null)
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
          <Button outline onClick={addIngredient} className="mt-1">
            <PlusIcon className="h-4 w-4 mr-1" />
            Ingrediënt toevoegen
          </Button>
        </div>
      </Fieldset>

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

export function getIngredientsForEditor(mealData: any): IngredientRow[] {
  return ingredientsFromMealData(mealData);
}

export function getInstructionsForEditor(aiAnalysis: any): InstructionRow[] {
  return instructionsFromAi(aiAnalysis);
}
