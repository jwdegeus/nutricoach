'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
import { Switch } from '@/components/catalyst/switch';
import { Input } from '@/components/catalyst/input';
import { Text } from '@/components/catalyst/text';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogDescription,
} from '@/components/catalyst/dialog';
import { Field, Label, FieldGroup } from '@/components/catalyst/fieldset';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { PlusIcon, PencilIcon, ArrowPathIcon } from '@heroicons/react/16/solid';
import type { AdhRefRow } from '../actions/therapeuticAdh.actions';
import {
  toggleAdhReferenceActiveAction,
  createAdhReferenceValueAction,
  updateAdhReferenceValueAction,
} from '../actions/therapeuticAdh.actions';

type Props = {
  initialData: AdhRefRow[] | null;
  loadError: string | null;
};

function formatLeeftijd(row: AdhRefRow): string {
  const min = row.age_min_years;
  const max = row.age_max_years;
  if (min == null && max == null) return '—';
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `≥ ${min}`;
  return `≤ ${max!}`;
}

const emptyForm = {
  key: '',
  sex: null as string | null,
  ageMinYears: null as number | null,
  ageMaxYears: null as number | null,
  unit: '',
  valueNum: 0,
  isActive: true,
};

export function TherapeuticAdhAdminClient({ initialData, loadError }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const t = useTranslations('admin.therapeuticAdh');

  const SEX_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: t('sexAll') },
    { value: 'female', label: t('sexFemale') },
    { value: 'male', label: t('sexMale') },
    { value: 'other', label: t('sexOther') },
    { value: 'unknown', label: t('sexUnknown') },
  ];

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<typeof emptyForm & { id: string }>({
    ...emptyForm,
    id: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const handleToggle = (id: string, nextActive: boolean) => {
    setTogglingId(id);
    startTransition(async () => {
      const result = await toggleAdhReferenceActiveAction({
        id,
        isActive: nextActive,
      });
      setTogglingId(null);
      if ('error' in result) {
        showToast({
          type: 'error',
          title: t('toastSetActiveError'),
          description: result.error,
        });
        return;
      }
      showToast({
        type: 'success',
        title: nextActive
          ? t('toastReferenceActivated')
          : t('toastReferenceDeactivated'),
      });
      router.refresh();
    });
  };

  const openCreate = () => {
    setCreateForm(emptyForm);
    setCreateError(null);
    setCreateOpen(true);
  };

  const openEdit = (row: AdhRefRow) => {
    setEditForm({
      id: row.id,
      key: row.key,
      sex: (row.sex ?? null) as 'unknown' | 'female' | 'male' | 'other' | null,
      ageMinYears: row.age_min_years,
      ageMaxYears: row.age_max_years,
      unit: row.unit,
      valueNum: row.value_num,
      isActive: row.is_active,
    });
    setEditError(null);
    setEditOpen(true);
  };

  const handleCreateSubmit = () => {
    setCreateError(null);
    setCreateSaving(true);
    createAdhReferenceValueAction({
      key: createForm.key.trim(),
      sex: (createForm.sex === '' ? null : createForm.sex) as
        | 'female'
        | 'male'
        | 'other'
        | 'unknown'
        | null,
      ageMinYears: createForm.ageMinYears,
      ageMaxYears: createForm.ageMaxYears,
      unit: createForm.unit.trim(),
      valueNum: createForm.valueNum,
      isActive: createForm.isActive,
    }).then((result) => {
      setCreateSaving(false);
      if ('error' in result) {
        setCreateError(result.error);
        return;
      }
      showToast({ type: 'success', title: t('toastReferenceAdded') });
      setCreateOpen(false);
      router.refresh();
    });
  };

  const handleEditSubmit = () => {
    setEditError(null);
    setEditSaving(true);
    updateAdhReferenceValueAction({
      id: editForm.id,
      key: editForm.key.trim(),
      sex: (editForm.sex === '' ? null : editForm.sex) as
        | 'female'
        | 'male'
        | 'other'
        | 'unknown'
        | null,
      ageMinYears: editForm.ageMinYears,
      ageMaxYears: editForm.ageMaxYears,
      unit: editForm.unit.trim(),
      valueNum: editForm.valueNum,
      isActive: editForm.isActive,
    }).then((result) => {
      setEditSaving(false);
      if ('error' in result) {
        setEditError(result.error);
        return;
      }
      showToast({ type: 'success', title: t('toastReferenceUpdated') });
      setEditOpen(false);
      router.refresh();
    });
  };

  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-950/20">
          <Text className="text-red-800 dark:text-red-200">{loadError}</Text>
        </div>
        <Button outline onClick={() => router.refresh()}>
          {t('reload')}
        </Button>
      </div>
    );
  }

  if (initialData === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('pageTitle')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('pageDescription')}
          </p>
        </div>
        <Button outline onClick={openCreate}>
          <PlusIcon />
          {t('new')}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table
          className="[--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]"
          striped
        >
          <TableHead>
            <TableRow>
              <TableHeader>{t('keyCol')}</TableHeader>
              <TableHeader>{t('sexCol')}</TableHeader>
              <TableHeader>{t('ageCol')}</TableHeader>
              <TableHeader>{t('valueCol')}</TableHeader>
              <TableHeader>{t('activeCol')}</TableHeader>
              <TableHeader>{t('updatedCol')}</TableHeader>
              <TableHeader className="w-24"></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {initialData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('noReferencesYet')}
                </TableCell>
              </TableRow>
            ) : (
              initialData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Text className="font-mono text-sm text-foreground">
                      {row.key}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text className="text-sm text-muted-foreground">
                      {row.sex ?? '—'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text className="text-sm text-muted-foreground">
                      {formatLeeftijd(row)}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text className="text-sm text-foreground">
                      {row.value_num} {row.unit}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      {togglingId === row.id && (
                        <ArrowPathIcon className="size-4 animate-spin text-muted-foreground" />
                      )}
                      <Switch
                        checked={row.is_active}
                        disabled={togglingId === row.id || isPending}
                        onChange={(checked) => handleToggle(row.id, checked)}
                        color="dark/zinc"
                      />
                    </span>
                  </TableCell>
                  <TableCell>
                    <Text className="text-sm text-muted-foreground">
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleDateString('nl-NL', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Button
                      plain
                      className="text-sm underline"
                      onClick={() => openEdit(row)}
                    >
                      <PencilIcon className="size-4" />
                      {t('editButton')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create modal */}
      <Dialog
        open={createOpen}
        onClose={() => !createSaving && setCreateOpen(false)}
      >
        <DialogTitle>{t('newReferenceTitle')}</DialogTitle>
        <DialogDescription>{t('newReferenceDescription')}</DialogDescription>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>{t('keyLabel')}</Label>
              <Input
                value={createForm.key}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, key: e.target.value }))
                }
                placeholder={t('keyPlaceholder')}
                disabled={createSaving}
              />
            </Field>
            <Field>
              <Label>{t('sexLabel')}</Label>
              <Listbox
                value={createForm.sex ?? ''}
                onChange={(val) =>
                  setCreateForm((f) => ({
                    ...f,
                    sex: val === '' ? null : val,
                  }))
                }
                disabled={createSaving}
                aria-label={t('sexLabel')}
              >
                {SEX_OPTIONS.map((o) => (
                  <ListboxOption key={o.value || 'all'} value={o.value ?? ''}>
                    {o.label}
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
            <Field>
              <Label>{t('ageMinLabel')}</Label>
              <Input
                type="number"
                min={0}
                value={createForm.ageMinYears ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setCreateForm((f) => ({
                    ...f,
                    ageMinYears: v === '' ? null : parseInt(v, 10) || null,
                  }));
                }}
                placeholder="—"
                disabled={createSaving}
              />
            </Field>
            <Field>
              <Label>{t('ageMaxLabel')}</Label>
              <Input
                type="number"
                min={0}
                value={createForm.ageMaxYears ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setCreateForm((f) => ({
                    ...f,
                    ageMaxYears: v === '' ? null : parseInt(v, 10) || null,
                  }));
                }}
                placeholder="—"
                disabled={createSaving}
              />
            </Field>
            <Field>
              <Label>{t('unitLabel')}</Label>
              <Input
                value={createForm.unit}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, unit: e.target.value }))
                }
                placeholder={t('unitPlaceholder')}
                disabled={createSaving}
              />
            </Field>
            <Field>
              <Label>{t('valueLabel')}</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={createForm.valueNum}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    valueNum: Number(e.target.value) || 0,
                  }))
                }
                disabled={createSaving}
              />
            </Field>
            <Field>
              <div className="flex items-center gap-2">
                <Switch
                  checked={createForm.isActive}
                  onChange={(checked) =>
                    setCreateForm((f) => ({ ...f, isActive: checked }))
                  }
                  disabled={createSaving}
                  color="dark/zinc"
                />
                <Label>{t('activeLabel')}</Label>
              </div>
            </Field>
          </FieldGroup>
          {createError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-950/20">
              <Text className="text-sm text-red-800 dark:text-red-200">
                {createError}
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => !createSaving && setCreateOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleCreateSubmit}
            disabled={
              createSaving || !createForm.key.trim() || !createForm.unit.trim()
            }
          >
            {createSaving ? (
              <>
                <ArrowPathIcon className="size-4 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('save')
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)}>
        <DialogTitle>{t('editReferenceTitle')}</DialogTitle>
        <DialogDescription>{t('editReferenceDescription')}</DialogDescription>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>{t('keyLabel')}</Label>
              <Input
                value={editForm.key}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, key: e.target.value }))
                }
                disabled={editSaving}
              />
            </Field>
            <Field>
              <Label>{t('sexLabel')}</Label>
              <Listbox
                value={editForm.sex ?? ''}
                onChange={(val) =>
                  setEditForm((f) => ({
                    ...f,
                    sex: val === '' ? null : val,
                  }))
                }
                disabled={editSaving}
                aria-label={t('sexLabel')}
              >
                {SEX_OPTIONS.map((o) => (
                  <ListboxOption key={o.value || 'all'} value={o.value ?? ''}>
                    {o.label}
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
            <Field>
              <Label>{t('ageMinLabel')}</Label>
              <Input
                type="number"
                min={0}
                value={editForm.ageMinYears ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditForm((f) => ({
                    ...f,
                    ageMinYears: v === '' ? null : parseInt(v, 10) || null,
                  }));
                }}
                disabled={editSaving}
              />
            </Field>
            <Field>
              <Label>{t('ageMaxLabel')}</Label>
              <Input
                type="number"
                min={0}
                value={editForm.ageMaxYears ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditForm((f) => ({
                    ...f,
                    ageMaxYears: v === '' ? null : parseInt(v, 10) || null,
                  }));
                }}
                disabled={editSaving}
              />
            </Field>
            <Field>
              <Label>{t('unitLabel')}</Label>
              <Input
                value={editForm.unit}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, unit: e.target.value }))
                }
                disabled={editSaving}
              />
            </Field>
            <Field>
              <Label>{t('valueEditLabel')}</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={editForm.valueNum}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    valueNum: Number(e.target.value) || 0,
                  }))
                }
                disabled={editSaving}
              />
            </Field>
            <Field>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editForm.isActive}
                  onChange={(checked) =>
                    setEditForm((f) => ({ ...f, isActive: checked }))
                  }
                  disabled={editSaving}
                  color="dark/zinc"
                />
                <Label>{t('activeLabel')}</Label>
              </div>
            </Field>
          </FieldGroup>
          {editError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-950/20">
              <Text className="text-sm text-red-800 dark:text-red-200">
                {editError}
              </Text>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => !editSaving && setEditOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleEditSubmit}
            disabled={
              editSaving || !editForm.key.trim() || !editForm.unit.trim()
            }
          >
            {editSaving ? (
              <>
                <ArrowPathIcon className="size-4 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('save')
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
