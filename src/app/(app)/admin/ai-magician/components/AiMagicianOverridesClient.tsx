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
import { Textarea } from '@/components/catalyst/textarea';
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
import type { MagicianOverrideRow } from '../actions/magicianOverrides.actions';
import {
  listMagicianOverridesAction,
  upsertMagicianOverrideAction,
  deleteMagicianOverrideAction,
  setMagicianOverrideActiveAction,
} from '../actions/magicianOverrides.actions';
import { Link } from '@/components/catalyst/link';

type Props = {
  initialData: MagicianOverrideRow[];
  loadError: string | null;
};

const emptyForm = {
  forbiddenTerm: '',
  excludeIfContains: '' as string,
  description: '',
  isActive: true,
  displayOrder: 0,
};

function excludeToText(arr: string[]): string {
  return arr.join(', ');
}

function textToExclude(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export function AiMagicianOverridesClient({ initialData, loadError }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<MagicianOverrideRow[]>(initialData);
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
    const result = await listMagicianOverridesAction();
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

  function openEdit(row: MagicianOverrideRow) {
    setDialogMode('edit');
    setEditingId(row.id);
    setForm({
      forbiddenTerm: row.forbidden_term,
      excludeIfContains: excludeToText(row.exclude_if_contains),
      description: row.description ?? '',
      isActive: row.is_active,
      displayOrder: row.display_order,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function submitForm() {
    const patterns = textToExclude(form.excludeIfContains);
    if (patterns.length === 0) {
      setFormError('Minimaal één uitsluitpatroon is verplicht');
      return;
    }

    setSaving(true);
    setFormError(null);
    const result = await upsertMagicianOverrideAction({
      ...(dialogMode === 'edit' && editingId && { id: editingId }),
      forbiddenTerm: form.forbiddenTerm.trim(),
      excludeIfContains: patterns,
      description: form.description.trim() || undefined,
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
        dialogMode === 'create'
          ? 'Uitsluiting toegevoegd'
          : 'Uitsluiting bijgewerkt',
    });
    setDialogOpen(false);
    router.refresh();
    load();
  }

  async function toggleActive(row: MagicianOverrideRow) {
    setTogglingId(row.id);
    const result = await setMagicianOverrideActiveAction(
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
        ? 'Uitsluiting geactiveerd'
        : 'Uitsluiting gepauzeerd',
    });
    setItems((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, is_active: result.data.is_active } : r,
      ),
    );
    router.refresh();
  }

  async function confirmDelete(id: string) {
    const result = await deleteMagicianOverrideAction(id);
    if ('error' in result) {
      showToast({
        type: 'error',
        title: 'Verwijderen mislukt',
        description: result.error,
      });
      return;
    }
    showToast({ type: 'success', title: 'Uitsluiting verwijderd' });
    setDeleteId(null);
    router.refresh();
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            AI Magician – False-positive uitsluitingen
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Als een ingrediënt een van de uitsluitpatronen bevat, wordt de match
            op de verboden term genegeerd. Bijv. &quot;zoete aardappel&quot;
            voor term &quot;aardappel&quot; (zoete aardappel is geen
            nachtschade).
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
            Nieuwe uitsluiting
          </Button>
        </div>
      </div>

      <div className="rounded-2xl bg-muted/20 shadow-sm [&_table]:w-full [&_table]:table-fixed">
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader className="w-24">Term</TableHeader>
                <TableHeader className="w-[200px]">
                  Uitsluit als bevat
                </TableHeader>
                <TableHeader className="w-[180px]">Beschrijving</TableHeader>
                <TableHeader className="w-36">Status</TableHeader>
                <TableHeader className="w-12"> </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {error
                      ? `Fout: ${error}`
                      : 'Geen overrides. Klik op Nieuwe uitsluiting om er een toe te voegen.'}
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
                    <TableCell className="max-w-[200px] min-w-0">
                      <span
                        className="block truncate text-sm text-muted-foreground"
                        title={excludeToText(row.exclude_if_contains)}
                      >
                        {excludeToText(row.exclude_if_contains)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[180px] min-w-0">
                      <span
                        className="block truncate text-sm text-muted-foreground"
                        title={row.description ?? ''}
                      >
                        {row.description ?? '—'}
                      </span>
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
        Dieetregels (verboden termen, synoniemen, substituties) beheer je via{' '}
        <Link
          href="/settings/diets"
          className="text-accent-600 hover:underline"
        >
          Dieettypes
        </Link>{' '}
        → bewerk een dieet → GuardRails. Extra NL↔EN synoniemen voor matching:{' '}
        <Link
          href="/admin/ai-magician/synonyms"
          className="text-accent-600 hover:underline"
        >
          Ingredient synoniemen
        </Link>
        .
      </p>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>
          {dialogMode === 'create'
            ? 'Nieuwe uitsluiting'
            : 'Uitsluiting bewerken'}
        </DialogTitle>
        <DialogDescription>
          Verboden term en de patronen die een match uitsluiten (false
          positive).
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
                placeholder="bijv. aardappel, bloem, pasta"
                disabled={dialogMode === 'edit'}
              />
              {dialogMode === 'edit' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Term kan niet gewijzigd worden; maak een nieuwe aan en
                  verwijder de oude.
                </p>
              )}
            </Field>
            <Field>
              <Label>Uitsluit als bevat (comma- of newline-gescheiden)</Label>
              <Textarea
                value={form.excludeIfContains}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    excludeIfContains: e.target.value,
                  }))
                }
                placeholder="zoete aardappel, sweet potato, bataat"
                rows={4}
              />
            </Field>
            <Field>
              <Label>Beschrijving (optioneel)</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Zoete aardappel is geen nachtschade"
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
              saving ||
              !form.forbiddenTerm.trim() ||
              textToExclude(form.excludeIfContains).length === 0
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
        title="Uitsluiting verwijderen"
        description="Weet je het zeker? De uitsluiting wordt verwijderd. Voor deze term zijn dan geen false-positive uitsluitingen meer actief."
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
      />
    </div>
  );
}
