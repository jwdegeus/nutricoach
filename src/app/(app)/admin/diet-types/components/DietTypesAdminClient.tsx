"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getAllDietTypes,
  createDietType,
  deleteDietType,
  type DietTypeOutput,
  type DietTypeInput,
} from "@/src/app/(app)/settings/actions/diet-admin.actions";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Field, FieldGroup, Label, Description } from "@/components/catalyst/fieldset";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { ConfirmDialog } from "@/components/catalyst/confirm-dialog";
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from "@/components/catalyst/dialog";
import { Badge } from "@/components/catalyst/badge";
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@/components/catalyst/dropdown";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/catalyst/table";
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/20/solid";

export function DietTypesAdminClient() {
  const router = useRouter();
  const [dietTypes, setDietTypes] = useState<DietTypeOutput[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteDietId, setDeleteDietId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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

  function handleCreate() {
    setFormData({
      name: "",
      description: "",
      displayOrder: dietTypes.length > 0 ? Math.max(...dietTypes.map(dt => dt.displayOrder)) + 1 : 0,
      isActive: true,
    });
    setShowCreateDialog(true);
    setError(null);
    setSuccess(null);
  }

  function cancelCreate() {
    setShowCreateDialog(false);
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
      <div className="p-6">
        <Text className="text-zinc-500 dark:text-zinc-400">Dieettypes laden...</Text>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            Dieettypes Beheer
          </h1>
          <p className="mt-2 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
            Maak en beheer dieettypes die beschikbaar zijn in de onboarding en account pagina.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <PlusIcon className="h-4 w-4 mr-1" />
          Nieuw dieettype
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>Fout:</strong> {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          <strong>Succes:</strong> {success}
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="overflow-x-auto">
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>Naam</TableHeader>
                <TableHeader>Volgorde</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="text-right"></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {dietTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-zinc-500 dark:text-zinc-400 py-8">
                    Geen dieettypes gevonden
                  </TableCell>
                </TableRow>
              ) : (
                dietTypes.map((dietType) => (
                  <TableRow key={dietType.id}>
                    <TableCell>
                      <Text className="font-medium text-zinc-950 dark:text-white">
                        {dietType.name}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                        {dietType.displayOrder}
                      </Text>
                    </TableCell>
                    <TableCell>
                      {dietType.isActive ? (
                        <Badge color="green">Actief</Badge>
                      ) : (
                        <Badge color="zinc">Inactief</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Dropdown>
                          <DropdownButton plain>
                            <EllipsisVerticalIcon className="h-5 w-5 text-zinc-500" />
                            <span className="sr-only">Acties</span>
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownSection>
                              <DropdownItem onClick={() => handleEdit(dietType)}>
                                <PencilIcon data-slot="icon" />
                                <span>Bewerken</span>
                              </DropdownItem>
                              <DropdownItem
                                onClick={() => handleDelete(dietType.id)}
                                className="text-red-600 data-focus:text-white data-focus:bg-red-600 dark:text-red-400"
                              >
                                <TrashIcon data-slot="icon" />
                                <span>Verwijderen</span>
                              </DropdownItem>
                            </DropdownSection>
                          </DropdownMenu>
                        </Dropdown>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

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

      <Dialog open={showCreateDialog} onClose={cancelCreate}>
        <DialogTitle>Nieuw dieettype aanmaken</DialogTitle>
        <DialogDescription>
          Voeg een nieuw dieettype toe aan het systeem.
        </DialogDescription>
        <form onSubmit={handleSubmit}>
          <DialogBody>
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
            </FieldGroup>
          </DialogBody>
          <DialogActions>
            <Button type="button" onClick={cancelCreate} color="zinc">
              Annuleren
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Opslaan..." : "Aanmaken"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}
