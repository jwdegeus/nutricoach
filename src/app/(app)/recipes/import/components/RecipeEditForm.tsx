"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Textarea } from "@/components/catalyst/textarea";
import { Field, Fieldset, Label, Description } from "@/components/catalyst/fieldset";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { PencilIcon, CheckIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { updateRecipeImportAction } from "../actions/recipeImport.update.actions";
import type { GeminiExtractedRecipe } from "../recipeImport.gemini.schemas";

type RecipeEditFormProps = {
  jobId: string;
  recipe: GeminiExtractedRecipe;
  sourceImageMeta?: {
    savedImageUrl?: string;
    imageUrl?: string;
  } | null;
  onUpdated: () => void;
};

export function RecipeEditForm({ jobId, recipe, sourceImageMeta, onUpdated }: RecipeEditFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState(recipe.title);
  const [servings, setServings] = useState<string>(recipe.servings?.toString() || "");
  const [ingredients, setIngredients] = useState(recipe.ingredients || []);
  const [instructions, setInstructions] = useState(recipe.instructions || []);

  const handleSave = () => {
    setError(null);
    
    // Validate required fields
    if (!title.trim()) {
      setError("Titel is verplicht");
      return;
    }

    if (ingredients.length === 0) {
      setError("Minimaal één ingrediënt is verplicht");
      return;
    }

    if (ingredients.some(ing => !ing.name.trim())) {
      setError("Alle ingrediënten moeten een naam hebben");
      return;
    }

    if (instructions.length === 0) {
      setError("Minimaal één bereidingsinstructie is verplicht");
      return;
    }

    if (instructions.some(inst => !inst.text.trim())) {
      setError("Alle bereidingsinstructies moeten tekst bevatten");
      return;
    }
    
    startTransition(async () => {
      const result = await updateRecipeImportAction({
        jobId,
        updates: {
          title: title.trim(),
          servings: servings ? parseInt(servings) : null,
          ingredients: ingredients
            .filter(ing => ing.name.trim()) // Filter out empty ingredients
            .map(ing => ({
              name: ing.name.trim(),
              quantity: ing.quantity,
              unit: ing.unit || null,
              note: ing.note || null,
            })),
          instructions: instructions
            .filter(inst => inst.text.trim()) // Filter out empty instructions
            .map((inst, idx) => ({
              step: idx + 1,
              text: inst.text.trim(),
            })),
        },
      });

      if (result.ok) {
        setIsEditing(false);
        onUpdated();
      } else {
        setError(result.error.message);
      }
    });
  };

  const handleCancel = () => {
    // Reset form to original values
    setTitle(recipe.title);
    setServings(recipe.servings?.toString() || "");
    setIngredients(recipe.ingredients || []);
    setInstructions(recipe.instructions || []);
    setError(null);
    setIsEditing(false);
  };

  const updateIngredient = (index: number, field: 'name' | 'quantity' | 'unit' | 'note', value: string | number | null) => {
    const updated = [...ingredients];
    updated[index] = {
      ...updated[index],
      [field]: value,
      // Preserve original_line if it exists, otherwise use name
      original_line: updated[index].original_line || (field === 'name' ? String(value) : updated[index].name),
    };
    setIngredients(updated);
  };

  const updateInstruction = (index: number, text: string) => {
    const updated = [...instructions];
    updated[index] = {
      ...updated[index],
      text,
    };
    setInstructions(updated);
  };

  if (!isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Heading level={3}>Recept Details</Heading>
          <Button onClick={() => setIsEditing(true)} outline>
            <PencilIcon className="h-4 w-4 mr-2" />
            Bewerken
          </Button>
        </div>

        {/* Display mode */}
        <div className="space-y-4">
          {/* Recipe Image */}
          {(sourceImageMeta?.savedImageUrl || sourceImageMeta?.imageUrl) && (
            <div>
              <Subheading level={4}>Afbeelding</Subheading>
              <div className="mt-2">
                <img
                  src={sourceImageMeta.savedImageUrl || sourceImageMeta.imageUrl || undefined}
                  alt={title}
                  className="w-full max-w-md h-auto rounded-lg border border-zinc-200 dark:border-zinc-800 object-cover"
                  onError={(e) => {
                    // Hide image if it fails to load
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <Subheading level={4}>Titel</Subheading>
            <Text className="text-lg font-medium">{title}</Text>
          </div>

          {servings && (
            <div>
              <Subheading level={4}>Portiegrootte</Subheading>
              <Text>{servings}</Text>
            </div>
          )}

          <div>
            <Subheading level={4}>Ingrediënten</Subheading>
            <ul className="mt-2 space-y-1">
              {ingredients.map((ing, idx) => (
                <li key={idx} className="text-sm">
                  <span className="font-medium">{ing.name}</span>
                  {(ing.quantity !== null || ing.unit) && (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {" "}
                      {ing.quantity !== null && ing.quantity}
                      {ing.quantity !== null && ing.unit && " "}
                      {ing.unit}
                    </span>
                  )}
                  {ing.note && (
                    <span className="text-zinc-500 dark:text-zinc-400 italic">
                      {" "}({ing.note})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Subheading level={4}>Bereidingsinstructies</Subheading>
            <ol className="mt-2 space-y-2 list-decimal list-inside">
              {instructions.map((inst, idx) => (
                <li key={idx} className="text-sm">{inst.text}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Heading level={3}>Recept Bewerken</Heading>
        <div className="flex gap-2">
          <Button onClick={handleCancel} outline disabled={isPending}>
            <XMarkIcon className="h-4 w-4 mr-2" />
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            <CheckIcon className="h-4 w-4 mr-2" />
            {isPending ? "Opslaan..." : "Opslaan"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4">
          <Text className="text-sm text-red-600 dark:text-red-400">{error}</Text>
        </div>
      )}

      <Fieldset>
        <Field>
          <Label>Titel *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPending}
            required
          />
        </Field>

        <Field>
          <Label>Portiegrootte</Label>
          <Input
            type="number"
            min="1"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            disabled={isPending}
            placeholder="Bijv. 4"
          />
          <Description>Laat leeg als niet van toepassing</Description>
        </Field>

        <Field>
          <Label>Ingrediënten *</Label>
          <div className="space-y-3 mt-2">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    value={ing.name || ""}
                    onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                    disabled={isPending}
                    placeholder="Ingrediënt naam"
                    required
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      value={ing.quantity || ""}
                      onChange={(e) => updateIngredient(idx, 'quantity', e.target.value ? parseFloat(e.target.value) : null)}
                      disabled={isPending}
                      placeholder="Hoeveelheid"
                      className="w-24"
                    />
                    <Input
                      value={ing.unit || ""}
                      onChange={(e) => updateIngredient(idx, 'unit', e.target.value || null)}
                      disabled={isPending}
                      placeholder="Eenheid"
                      className="w-24"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => {
                    const updated = ingredients.filter((_, i) => i !== idx);
                    setIngredients(updated);
                  }}
                  disabled={isPending}
                  outline
                  color="red"
                >
                  <XMarkIcon className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              onClick={() => {
                setIngredients([...ingredients, { name: "", quantity: null, unit: null, note: null }]);
              }}
              disabled={isPending}
              outline
            >
              + Ingrediënt toevoegen
            </Button>
          </div>
        </Field>

        <Field>
          <Label>Bereidingsinstructies *</Label>
          <div className="space-y-3 mt-2">
            {instructions.map((inst, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Text className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      Stap {inst.step}:
                    </Text>
                  </div>
                  <Textarea
                    value={inst.text}
                    onChange={(e) => updateInstruction(idx, e.target.value)}
                    disabled={isPending}
                    placeholder="Beschrijf deze stap..."
                    required
                    rows={3}
                  />
                </div>
                <Button
                  onClick={() => {
                    const updated = instructions
                      .filter((_, i) => i !== idx)
                      .map((inst, newIdx) => ({ ...inst, step: newIdx + 1 }));
                    setInstructions(updated);
                  }}
                  disabled={isPending}
                  outline
                  color="red"
                >
                  <XMarkIcon className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              onClick={() => {
                setInstructions([...instructions, { step: instructions.length + 1, text: "" }]);
              }}
              disabled={isPending}
              outline
            >
              + Stap toevoegen
            </Button>
          </div>
        </Field>
      </Fieldset>
    </div>
  );
}
