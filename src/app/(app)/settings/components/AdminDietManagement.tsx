"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getAllDietTypes,
  createDietType,
  updateDietType,
  deleteDietType,
  type DietTypeOutput,
  type DietTypeInput,
} from "../actions/diet-admin.actions";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Field, FieldGroup, Label, Description } from "@/components/catalyst/fieldset";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { ConfirmDialog } from "@/components/catalyst/confirm-dialog";

export function AdminDietManagement() {
  const router = useRouter();
  const [dietTypes, setDietTypes] = useState<DietTypeOutput[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDietId, setDeleteDietId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Form state for creating new diet type
  const [formData, setFormData] = useState<DietTypeInput>({
    name: "",
    description: "",
    displayOrder: 0,
    isActive: true,
  });

  useEffect(() => {
    loadDietTypes();
  }, []);

  async function loadDietTypes() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAllDietTypes();
      if ("error" in result) {
        setError(result.error);
      } else if (result.data) {
        setDietTypes(result.data);
      }
    } catch (err) {
      setError("Onverwachte fout bij laden dieettypes");
    } finally {
      setIsLoading(false);
    }
  }

  function handleEdit(dietType: DietTypeOutput) {
    router.push(`/settings/diets/${dietType.id}/edit`);
  }

  function startCreate() {
    setFormData({
      name: "",
      description: "",
      displayOrder: dietTypes.length > 0 ? Math.max(...dietTypes.map(dt => dt.displayOrder)) + 1 : 0,
      isActive: true,
    });
    setIsCreating(true);
    setError(null);
    setSuccess(null);
  }

  function cancelCreate() {
    setIsCreating(false);
    setFormData({
      name: "",
      description: "",
      displayOrder: 0,
      isActive: true,
    });
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.name.trim()) {
      setError("Naam is verplicht");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createDietType(formData);
        if ("error" in result) {
          setError(result.error);
        } else {
          setSuccess("Dieettype succesvol aangemaakt");
          cancelCreate();
          await loadDietTypes();
        }
      } catch (err) {
        setError("Onverwachte fout bij opslaan");
      }
    });
  }

  function handleDelete(id: string) {
    setDeleteDietId(id);
    setShowDeleteDialog(true);
  }

  async function handleDeleteConfirm() {
    if (!deleteDietId) return;

    setShowDeleteDialog(false);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const result = await deleteDietType(deleteDietId);
        if ("error" in result) {
          setError(result.error);
        } else {
          setSuccess("Dieettype succesvol verwijderd (gedeactiveerd)");
          await loadDietTypes();
        }
      } catch (err) {
        setError("Onverwachte fout bij verwijderen");
      } finally {
        setDeleteDietId(null);
      }
    });
  }

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Text>Dieettypes laden...</Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeleteDietId(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Dieettype verwijderen"
        description="Weet je zeker dat je dit dieettype wilt verwijderen? (Het wordt gedeactiveerd)"
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isPending}
      />
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
              Dieettypes beheren
            </h2>
            <Text className="mt-1">
              Maak en beheer dieettypes die beschikbaar zijn in de onboarding en account pagina.
            </Text>
          </div>
          {!isCreating && (
            <Button onClick={startCreate}>Nieuw dieettype</Button>
          )}
        </div>

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

        {isCreating && (
          <form onSubmit={handleSubmit} className="mb-6 space-y-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <FieldGroup>
              <Field>
                <Label htmlFor="name">Naam *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  placeholder="Bijv. Keto, Vegetarisch, etc."
                />
              </Field>

              <Field>
                <Label htmlFor="description">Beschrijving</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                  placeholder="Beschrijving van het dieettype"
                />
              </Field>

              <Field>
                <Label htmlFor="displayOrder">Weergave volgorde</Label>
                <Input
                  id="displayOrder"
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      displayOrder: parseInt(e.target.value) || 0,
                    })
                  }
                  min={0}
                />
                <Description>
                  Lagere nummers verschijnen eerst in de lijst
                </Description>
              </Field>

              <CheckboxField>
                <Checkbox
                  checked={formData.isActive}
                  onChange={(value) =>
                    setFormData({ ...formData, isActive: value })
                  }
                />
                <Label>Actief</Label>
                <Description>
                  Alleen actieve dieettypes zijn zichtbaar voor gebruikers
                </Description>
              </CheckboxField>

              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Opslaan..." : "Aanmaken"}
                </Button>
                <Button type="button" onClick={cancelCreate} color="zinc">
                  Annuleren
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}

        <div className="space-y-2">
          {dietTypes.length === 0 ? (
            <Text className="text-zinc-500 dark:text-zinc-400">
              Geen dieettypes gevonden
            </Text>
          ) : (
            dietTypes.map((dietType) => (
              <div
                key={dietType.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Text className="font-medium text-zinc-950 dark:text-white">
                      {dietType.name}
                    </Text>
                    {!dietType.isActive && (
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        Inactief
                      </span>
                    )}
                  </div>
                  {dietType.description && (
                    <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {dietType.description}
                    </Text>
                  )}
                  <Text className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    Volgorde: {dietType.displayOrder}
                  </Text>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleEdit(dietType)}
                    color="zinc"
                    disabled={isCreating}
                  >
                    Bewerken
                  </Button>
                  <Button
                    onClick={() => handleDelete(dietType.id)}
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
      </div>
    </div>
  );
}
