"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Field, Label } from "@/components/catalyst/fieldset";
import { PencilIcon, CheckIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { ClockIcon, UserGroupIcon } from "@heroicons/react/20/solid";
import { updateRecipePrepTimeAndServingsAction } from "../../actions/meals.actions";

type RecipePrepTimeAndServingsEditorProps = {
  currentPrepTime: number | null | undefined;
  currentServings: number | null | undefined;
  mealId: string;
  source: "custom" | "gemini";
  onUpdated: () => void;
};

export function RecipePrepTimeAndServingsEditor({
  currentPrepTime,
  currentServings,
  mealId,
  source: mealSource,
  onUpdated,
}: RecipePrepTimeAndServingsEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [prepTime, setPrepTime] = useState<string>(
    currentPrepTime?.toString() || ""
  );
  const [servings, setServings] = useState<string>(
    currentServings?.toString() || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state with props when they change
  useEffect(() => {
    if (!isEditing) {
      setPrepTime(currentPrepTime?.toString() || "");
      setServings(currentServings?.toString() || "");
    }
  }, [currentPrepTime, currentServings, isEditing]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const prepTimeValue = prepTime.trim() === "" ? null : parseInt(prepTime, 10);
      const servingsValue = servings.trim() === "" ? null : parseInt(servings, 10);

      // Validate
      if (prepTimeValue !== null && (isNaN(prepTimeValue) || prepTimeValue < 0)) {
        setError("Bereidingstijd moet een positief getal zijn");
        setIsSaving(false);
        return;
      }

      if (servingsValue !== null && (isNaN(servingsValue) || servingsValue < 1)) {
        setError("Portiegrootte moet minimaal 1 zijn");
        setIsSaving(false);
        return;
      }

      const result = await updateRecipePrepTimeAndServingsAction({
        mealId,
        source: mealSource,
        prepTime: prepTimeValue,
        servings: servingsValue,
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      onUpdated();
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bijwerken mislukt");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setPrepTime(currentPrepTime?.toString() || "");
    setServings(currentServings?.toString() || "");
    setError(null);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="flex items-center gap-4 flex-wrap">
        {currentPrepTime !== null && currentPrepTime !== undefined && (
          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-zinc-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Bereidingstijd: <span className="font-medium">{currentPrepTime} minuten</span>
            </span>
          </div>
        )}
        {currentServings !== null && currentServings !== undefined && (
          <div className="flex items-center gap-2">
            <UserGroupIcon className="h-4 w-4 text-zinc-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Porties: <span className="font-medium">{currentServings}</span>
            </span>
          </div>
        )}
        {(currentPrepTime === null || currentPrepTime === undefined) &&
          (currentServings === null || currentServings === undefined) && (
            <span className="text-sm text-zinc-500 dark:text-zinc-500">
              Geen bereidingstijd of portiegrootte ingesteld
            </span>
          )}
        <Button
          plain
          onClick={() => setIsEditing(true)}
          className="text-sm"
        >
          <PencilIcon className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field>
          <Label>Bereidingstijd (minuten)</Label>
          <Input
            type="number"
            min="0"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
            placeholder="Bijv. 30"
            disabled={isSaving}
          />
        </Field>

        <Field>
          <Label>Portiegrootte</Label>
          <Input
            type="number"
            min="1"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            placeholder="Bijv. 4"
            disabled={isSaving}
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Bij wijziging worden ingrediënten en instructies automatisch aangepast
          </p>
        </Field>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          color="primary"
          className="text-sm"
        >
          <CheckIcon className="h-4 w-4 mr-1" />
          {isSaving ? "Opslaan..." : "Opslaan"}
        </Button>
        <Button
          plain
          onClick={handleCancel}
          disabled={isSaving}
          className="text-sm"
        >
          <XMarkIcon className="h-4 w-4 mr-1" />
          Annuleren
        </Button>
      </div>
    </div>
  );
}
