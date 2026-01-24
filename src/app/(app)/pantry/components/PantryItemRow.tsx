"use client";

import { useState } from "react";
import { Input } from "@/components/catalyst/input";
import { Button } from "@/components/catalyst/button";
import { upsertUserPantryItemAction, deletePantryItemAction } from "../actions/pantry-ui.actions";
import { Loader2, Save, X, Trash2 } from "lucide-react";
import type { NutriScoreGrade } from "@/src/lib/nevo/nutrition-calculator";
import { ConfirmDialog } from "@/components/catalyst/confirm-dialog";

export type PantryItemRowProps = {
  item: {
    id: string;
    nevoCode: string;
    name: string;
    availableG: number | null;
    isAvailable: boolean;
    nutriscore: NutriScoreGrade | null;
  };
  onUpdate: () => void;
};

export function PantryItemRow({ item, onUpdate }: PantryItemRowProps) {
  const [isAvailable, setIsAvailable] = useState(item.isAvailable);
  const [availableG, setAvailableG] = useState<string>(
    item.availableG?.toString() || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggle = () => {
    const newValue = !isAvailable;
    setIsAvailable(newValue);
    setHasChanges(true);
    setError(null);
  };

  const handleQuantityChange = (value: string) => {
    setAvailableG(value);
    setHasChanges(true);
    setError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const parsedG =
        availableG.trim() === "" ? null : parseFloat(availableG.trim());

      if (parsedG !== null && (isNaN(parsedG) || parsedG < 0)) {
        setError("Hoeveelheid moet een positief getal zijn");
        setIsSaving(false);
        return;
      }

      const result = await upsertUserPantryItemAction({
        nevoCode: item.nevoCode,
        isAvailable,
        availableG: parsedG,
      });

      if (result.ok) {
        setHasChanges(false);
        onUpdate();
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fout bij opslaan"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const result = await deletePantryItemAction(item.nevoCode);

      if (result.ok) {
        setShowDeleteDialog(false);
        onUpdate();
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fout bij verwijderen"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // NutriScore color mapping
  const getNutriScoreColor = (grade: NutriScoreGrade | null): string => {
    if (!grade) return "text-muted-foreground";
    switch (grade) {
      case 'A':
        return "text-green-600 dark:text-green-500";
      case 'B':
        return "text-lime-600 dark:text-lime-500";
      case 'C':
        return "text-yellow-600 dark:text-yellow-500";
      case 'D':
        return "text-orange-600 dark:text-orange-500";
      case 'E':
        return "text-red-600 dark:text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
      <div className="flex-1">
        <div className="font-medium">{item.name}</div>
        {item.nutriscore && (
          <div className="text-sm">
            NutriScore: <span className={`font-semibold ${getNutriScoreColor(item.nutriscore)}`}>{item.nutriscore}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAvailable}
            onChange={handleToggle}
            className="w-4 h-4"
          />
          <span className="text-sm">Aanwezig</span>
        </label>
      </div>

      <div className="w-32">
        <Input
          type="number"
          placeholder="Hoeveelheid (g)"
          value={availableG}
          onChange={(e) => handleQuantityChange(e.target.value)}
          min="0"
          step="1"
          disabled={isSaving}
          className="border-0 bg-white dark:bg-zinc-800 focus-visible:ring-0"
        />
      </div>

      {hasChanges && (
        <Button
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4 mr-1" />
              Opslaan
            </>
          )}
        </Button>
      )}

      <Button
        plain
        onClick={() => setShowDeleteDialog(true)}
        disabled={isSaving || isDeleting}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {error && (
        <div className="text-sm text-destructive flex items-center gap-2">
          <X className="h-4 w-4" />
          {error}
        </div>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Item verwijderen"
        description={`Weet je zeker dat je "${item.name}" uit je pantry wilt verwijderen?`}
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isDeleting}
      />
    </div>
  );
}
