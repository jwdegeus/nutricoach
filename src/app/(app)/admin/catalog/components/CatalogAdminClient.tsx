'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  adminListSystemCatalogOptionsAction,
  adminCreateSystemCatalogOptionAction,
  adminUpdateSystemCatalogOptionAction,
  type SystemCatalogOptionRow,
  type CatalogDimension,
} from '../actions/catalog-admin.actions';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { Switch } from '@/components/catalyst/switch';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/catalyst/table';
import { PlusIcon, PencilIcon } from '@heroicons/react/20/solid';
import { useToast } from '@/src/components/app/ToastContext';

const DIMENSION_OPTIONS: { value: CatalogDimension; label: string }[] = [
  { value: 'cuisine', label: 'Keuken' },
  { value: 'protein_type', label: 'Proteïne-type' },
  { value: 'meal_slot', label: 'Soort' },
  { value: 'recipe_book', label: 'Receptenboek' },
];

type CatalogSortBy = 'display_order' | 'label_az';

export function CatalogAdminClient() {
  const { showToast } = useToast();
  const [dimension, setDimension] = useState<CatalogDimension>('cuisine');
  /** Sort for Receptenboek: display order (sort_order) or A–Z. */
  const [sortBy, setSortBy] = useState<CatalogSortBy>('display_order');
  const [options, setOptions] = useState<SystemCatalogOptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<SystemCatalogOptionRow | null>(null);

  /** For Receptenboek: show A–Z; else use API order (sort_order). */
  const displayOptions =
    dimension === 'recipe_book' && sortBy === 'label_az'
      ? [...options].sort((a, b) => a.label.localeCompare(b.label, 'nl'))
      : options;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await adminListSystemCatalogOptionsAction({ dimension });
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      setOptions([]);
      return;
    }
    setOptions(result.data);
  }, [dimension]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateOpen = () => {
    setCreateOpen(true);
    setError(null);
  };

  const handleEditOpen = (row: SystemCatalogOptionRow) => {
    setEditRow(row);
    setEditOpen(true);
    setError(null);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            Catalog opties
          </h1>
          <p className="mt-2 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
            Beheer system opties voor Keuken, Proteïne-type, Soort en
            Receptenboek. Deze keuzes verschijnen in classificatie en filters.
          </p>
        </div>
        <Button onClick={handleCreateOpen} disabled={loading}>
          <PlusIcon className="h-4 w-4 mr-1" />
          Nieuwe optie
        </Button>
      </div>

      {/* Dimension switcher + sort (Receptenboek) */}
      <div className="flex flex-wrap items-center gap-4 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex gap-2">
          {DIMENSION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDimension(opt.value)}
              className={
                dimension === opt.value
                  ? 'border-b-2 border-primary-500 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400'
                  : 'border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        {dimension === 'recipe_book' && (
          <div className="flex items-center gap-2 pb-2">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Sortering:
            </span>
            <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 p-0.5">
              <button
                type="button"
                onClick={() => setSortBy('display_order')}
                className={
                  sortBy === 'display_order'
                    ? 'rounded-md bg-zinc-200 dark:bg-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-950 dark:text-white'
                    : 'rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }
              >
                Weergavevolgorde
              </button>
              <button
                type="button"
                onClick={() => setSortBy('label_az')}
                className={
                  sortBy === 'label_az'
                    ? 'rounded-md bg-zinc-200 dark:bg-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-950 dark:text-white'
                    : 'rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }
              >
                A – Z
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-sm text-red-700 dark:text-red-300"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
        <Text className="text-zinc-500 dark:text-zinc-400">Opties laden…</Text>
      ) : displayOptions.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 p-8 text-center">
          <Text className="text-zinc-600 dark:text-zinc-400">
            Geen system opties voor{' '}
            {DIMENSION_OPTIONS.find((o) => o.value === dimension)?.label ??
              dimension}
            .
          </Text>
          <Button className="mt-4" onClick={handleCreateOpen}>
            <PlusIcon className="h-4 w-4 mr-1" />
            Eerste optie toevoegen
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table
            className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]"
            striped
          >
            <TableHead>
              <TableRow>
                <TableHeader>Label</TableHeader>
                <TableHeader>Key</TableHeader>
                <TableHeader>Actief</TableHeader>
                <TableHeader>Sort order</TableHeader>
                <TableHeader className="text-right">Acties</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayOptions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
                    {row.key}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.is_active}
                      disabled={savingId === row.id}
                      onChange={async (checked) => {
                        setSavingId(row.id);
                        const result =
                          await adminUpdateSystemCatalogOptionAction({
                            id: row.id,
                            isActive: checked,
                          });
                        setSavingId(null);
                        if (result.ok) {
                          setOptions((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? { ...r, is_active: result.data.is_active }
                                : r,
                            ),
                          );
                          showToast({
                            type: 'success',
                            title: result.data.is_active
                              ? 'Geactiveerd'
                              : 'Gedeactiveerd',
                          });
                        } else {
                          showToast({
                            type: 'error',
                            title: 'Bijwerken mislukt',
                            description: result.error.message,
                          });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>{row.sort_order}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      plain
                      className="text-blue-600 dark:text-blue-400"
                      disabled={savingId !== null}
                      onClick={() => handleEditOpen(row)}
                    >
                      <PencilIcon className="h-4 w-4 mr-1" />
                      Bewerken
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateOptionModal
        dimension={dimension}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          load();
          showToast({ type: 'success', title: 'Optie toegevoegd' });
        }}
        onError={(msg) =>
          showToast({
            type: 'error',
            title: 'Toevoegen mislukt',
            description: msg,
          })
        }
      />

      {editRow && (
        <EditOptionModal
          row={editRow}
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditRow(null);
          }}
          onSuccess={(updated) => {
            setOptions((prev) =>
              prev.map((r) => (r.id === updated.id ? updated : r)),
            );
            setEditOpen(false);
            setEditRow(null);
            showToast({ type: 'success', title: 'Opgeslagen' });
          }}
          onError={(msg) =>
            showToast({
              type: 'error',
              title: 'Opslaan mislukt',
              description: msg,
            })
          }
        />
      )}
    </div>
  );
}

function CreateOptionModal({
  dimension,
  open,
  onClose,
  onSuccess,
  onError,
}: {
  dimension: CatalogDimension;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setKey('');
    setLabel('');
    setSortOrder(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result = await adminCreateSystemCatalogOptionAction({
      dimension,
      key: key.trim(),
      label: label.trim(),
      sortOrder,
    });
    setSaving(false);
    if (result.ok) {
      onSuccess();
      reset();
    } else {
      onError(result.error.message);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} size="md">
      <DialogTitle>Nieuwe optie</DialogTitle>
      <DialogDescription>
        Voeg een system optie toe. Key mag alleen kleine letters, cijfers,
        streepje en underscore (bijv. mediterranean).
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Key</Label>
              <Input
                type="text"
                placeholder="bijv. mediterranean"
                value={key}
                onChange={(e) =>
                  setKey(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_\-]/g, ''),
                  )
                }
                required
                disabled={saving}
              />
            </Field>
            <Field>
              <Label>Label</Label>
              <Input
                type="text"
                placeholder="bijv. Mediterranean"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                disabled={saving}
              />
            </Field>
            <Field>
              <Label>Sort order</Label>
              <Input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(parseInt(e.target.value, 10) || 0)
                }
                disabled={saving}
              />
            </Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={handleClose} disabled={saving}>
            Annuleren
          </Button>
          <Button type="submit" color="primary" disabled={saving}>
            {saving ? 'Opslaan…' : 'Toevoegen'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function EditOptionModal({
  row,
  open,
  onClose,
  onSuccess,
  onError,
}: {
  row: SystemCatalogOptionRow;
  open: boolean;
  onClose: () => void;
  onSuccess: (updated: SystemCatalogOptionRow) => void;
  onError: (message: string) => void;
}) {
  const [label, setLabel] = useState(row.label);
  const [isActive, setIsActive] = useState(row.is_active);
  const [sortOrder, setSortOrder] = useState(row.sort_order);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLabel(row.label);
    setIsActive(row.is_active);
    setSortOrder(row.sort_order);
  }, [row]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result = await adminUpdateSystemCatalogOptionAction({
      id: row.id,
      label: label.trim(),
      isActive,
      sortOrder,
    });
    setSaving(false);
    if (result.ok) {
      onSuccess(result.data);
    } else {
      onError(result.error.message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>Optie bewerken</DialogTitle>
      <DialogDescription>
        Key is vast; je kunt label, actief en volgorde aanpassen.
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Key (alleen-lezen)</Label>
              <Text className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
                {row.key}
              </Text>
            </Field>
            <Field>
              <Label>Label</Label>
              <Input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                disabled={saving}
              />
            </Field>
            <Field>
              <div className="flex items-center gap-2">
                <Switch
                  checked={isActive}
                  onChange={setIsActive}
                  disabled={saving}
                />
                <Label>Actief</Label>
              </div>
            </Field>
            <Field>
              <Label>Sort order</Label>
              <Input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(parseInt(e.target.value, 10) || 0)
                }
                disabled={saving}
              />
            </Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={onClose} disabled={saving}>
            Annuleren
          </Button>
          <Button type="submit" color="primary" disabled={saving}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
