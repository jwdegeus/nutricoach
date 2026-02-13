'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/src/components/app/ToastContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogDescription,
} from '@/components/catalyst/dialog';
import { Field, Label, FieldGroup } from '@/components/catalyst/fieldset';
import { Switch } from '@/components/catalyst/switch';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  ArrowLeftIcon,
} from '@heroicons/react/16/solid';
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from '@/components/catalyst/dropdown';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import { Link } from '@/components/catalyst/link';
import type { MagicianIngredientSynonymRow } from '../../actions/magicianIngredientSynonyms.actions';
import {
  listMagicianIngredientSynonymsAction,
  upsertMagicianIngredientSynonymAction,
  deleteMagicianIngredientSynonymAction,
  setMagicianIngredientSynonymActiveAction,
} from '../../actions/magicianIngredientSynonyms.actions';

type Props = {
  initialData: MagicianIngredientSynonymRow[];
  loadError: string | null;
};

const emptyForm = {
  forbiddenTerm: '',
  synonym: '',
  isActive: true,
  displayOrder: 0,
};

export function MagicianIngredientSynonymsClient({
  initialData,
  loadError,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] =
    useState<MagicianIngredientSynonymRow[]>(initialData);
  const [error, setError] = useState<string | null>(loadError);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await listMagicianIngredientSynonymsAction();
    setLoading(false);
    if ('data' in result) {
      setItems(result.data);
    } else {
      setError(result.error);
    }
  }

  function openCreate() {
    setDialogMode('create');
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(row: MagicianIngredientSynonymRow) {
    setDialogMode('edit');
    setEditingId(row.id);
    setForm({
      forbiddenTerm: row.forbidden_term,
      synonym: row.synonym,
      isActive: row.is_active,
      displayOrder: row.display_order,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function submitForm() {
    if (!form.forbiddenTerm.trim() || !form.synonym.trim()) {
      setFormError('Term en synoniem zijn verplicht');
      return;
    }

    setSaving(true);
    setFormError(null);
    const result = await upsertMagicianIngredientSynonymAction({
      ...(dialogMode === 'edit' && editingId && { id: editingId }),
      forbiddenTerm: form.forbiddenTerm.trim(),
      synonym: form.synonym.trim(),
      isActive: form.isActive,
      displayOrder: form.displayOrder,
    });
    setSaving(false);

    if ('error' in result) {
      setFormError(result.error);
      return;
    }

    showToast({
      type: 'success',
      title:
        dialogMode === 'create' ? 'Synoniem toegevoegd' : 'Synoniem bijgewerkt',
    });
    setDialogOpen(false);
    router.refresh();
    load();
  }

  async function toggleActive(row: MagicianIngredientSynonymRow) {
    setTogglingId(row.id);
    const result = await setMagicianIngredientSynonymActiveAction(
      row.id,
      !row.is_active,
    );
    setTogglingId(null);
    if ('error' in result) {
      showToast({
        type: 'error',
        title: 'Status wijzigen mislukt',
        description: result.error,
      });
      return;
    }
    showToast({
      type: 'success',
      title: result.data.is_active
        ? 'Synoniem geactiveerd'
        : 'Synoniem gepauzeerd',
    });
    setItems((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, is_active: result.data.is_active } : r,
      ),
    );
    router.refresh();
  }

  async function confirmDelete(id: string) {
    const result = await deleteMagicianIngredientSynonymAction(id);
    if ('error' in result) {
      showToast({
        type: 'error',
        title: 'Verwijderen mislukt',
        description: result.error,
      });
      return;
    }
    showToast({ type: 'success', title: 'Synoniem verwijderd' });
    setDeleteId(null);
    router.refresh();
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/ai-magician"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-semibold text-foreground">
              AI Magician – Ingredient synoniemen
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Extra NL↔EN synoniemen voor matching. Bv. &quot;cheese&quot; →
            &quot;mozzarella&quot;: recept met mozzarella wordt dan ook als
            zuivel gematcht.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button outline onClick={load} disabled={loading}>
            <ArrowPathIcon
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            Vernieuwen
          </Button>
          <Button onClick={openCreate}>
            <PlusIcon className="h-4 w-4" />
            Nieuw synoniem
          </Button>
        </div>
      </div>

      <div className="rounded-2xl bg-muted/20 shadow-sm [&_table]:w-full [&_table]:table-fixed">
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader className="w-32">Term</TableHeader>
                <TableHeader className="w-40">Synoniem</TableHeader>
                <TableHeader className="w-28">Status</TableHeader>
                <TableHeader className="w-12"> </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {error
                      ? `Fout: ${error}`
                      : 'Geen synoniemen. Klik op Nieuw synoniem om er een toe te voegen.'}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <code className="rounded bg-muted/50 px-1.5 py-0.5 text-sm">
                        {row.forbidden_term}
                      </code>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted/50 px-1.5 py-0.5 text-sm">
                        {row.synonym}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={row.is_active}
                          onChange={() => toggleActive(row)}
                          disabled={togglingId === row.id}
                          color={row.is_active ? 'green' : 'dark/zinc'}
                        />
                        <span className="text-sm text-muted-foreground">
                          {row.is_active ? 'Actief' : 'Gepauzeerd'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="w-12">
                      <Dropdown>
                        <DropdownButton plain>
                          <EllipsisVerticalIcon
                            className="h-5 w-5 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="sr-only">Acties</span>
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          <DropdownSection>
                            <DropdownItem onClick={() => openEdit(row)}>
                              <PencilIcon data-slot="icon" />
                              <span>Bewerken</span>
                            </DropdownItem>
                            <DropdownItem
                              onClick={() => setDeleteId(row.id)}
                              className="text-red-600 data-focus:bg-red-600 data-focus:text-white dark:text-red-400"
                            >
                              <TrashIcon data-slot="icon" />
                              <span>Verwijderen</span>
                            </DropdownItem>
                          </DropdownSection>
                        </DropdownMenu>
                      </Dropdown>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        <Link
          href="/admin/ai-magician"
          className="text-accent-600 hover:underline"
        >
          ← Terug naar false-positive uitsluitingen
        </Link>
      </p>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>
          {dialogMode === 'create' ? 'Nieuw synoniem' : 'Synoniem bewerken'}
        </DialogTitle>
        <DialogDescription>
          Verboden term uit de ruleset en het synoniem dat ook als match telt.
        </DialogDescription>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>Verboden term</Label>
              <Input
                value={form.forbiddenTerm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, forbiddenTerm: e.target.value }))
                }
                placeholder="bijv. cheese, dairy, sugar"
                disabled={dialogMode === 'edit'}
              />
            </Field>
            <Field>
              <Label>Synoniem</Label>
              <Input
                value={form.synonym}
                onChange={(e) =>
                  setForm((f) => ({ ...f, synonym: e.target.value }))
                }
                placeholder="bijv. mozzarella, honing"
              />
            </Field>
          </FieldGroup>
          {formError && (
            <p className="mt-2 text-sm text-red-600">{formError}</p>
          )}
        </DialogBody>
        <DialogActions>
          <Button outline onClick={() => setDialogOpen(false)}>
            Annuleren
          </Button>
          <Button
            onClick={submitForm}
            disabled={
              saving || !form.forbiddenTerm.trim() || !form.synonym.trim()
            }
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) void confirmDelete(deleteId);
        }}
        title="Synoniem verwijderen"
        description="Weet je het zeker? Het synoniem wordt verwijderd."
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
      />
    </div>
  );
}
