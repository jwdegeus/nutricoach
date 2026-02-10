'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Textarea } from '@/components/catalyst/textarea';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/catalyst/dialog';
import { Link } from '@/components/catalyst/link';
import { useToast } from '@/src/components/app/ToastContext';
import {
  createGroceryStoreAction,
  updateGroceryStoreAction,
  deleteGroceryStoreAction,
} from '../actions/grocery-stores.actions';
import type { GroceryStoreRow } from '@/src/lib/grocery-stores/grocery-stores.types';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  BuildingStorefrontIcon,
} from '@heroicons/react/16/solid';

type GroceryStoresPageClientProps = {
  initialStores: GroceryStoreRow[];
};

export function GroceryStoresPageClient({
  initialStores,
}: GroceryStoresPageClientProps) {
  const t = useTranslations('groceryStores');
  const { showToast } = useToast();
  const [stores, setStores] = useState<GroceryStoreRow[]>(initialStores);
  const [addOpen, setAddOpen] = useState(false);
  const [editStore, setEditStore] = useState<GroceryStoreRow | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [cutoffTimes, setCutoffTimes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setStores(initialStores);
  }, [initialStores]);

  const openAdd = () => {
    setName('');
    setAddress('');
    setNotes('');
    setWebsiteUrl('');
    setCutoffTimes('');
    setEditStore(null);
    setAddOpen(true);
  };

  const openEdit = (store: GroceryStoreRow) => {
    setName(store.name);
    setAddress(store.address ?? '');
    setNotes(store.notes ?? '');
    setWebsiteUrl(store.websiteUrl ?? '');
    setCutoffTimes(store.cutoffTimes ?? '');
    setEditStore(store);
    setAddOpen(true);
  };

  const isEdit = editStore !== null;
  const closeForm = () => {
    setAddOpen(false);
    setEditStore(null);
    setName('');
    setAddress('');
    setNotes('');
    setWebsiteUrl('');
    setCutoffTimes('');
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast({ type: 'error', title: t('nameRequired') });
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        const result = await updateGroceryStoreAction(editStore.id, {
          name: trimmedName,
          address: address.trim() || null,
          notes: notes.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          cutoffTimes: cutoffTimes.trim() || null,
        });
        if (result.ok) {
          setStores((prev) =>
            prev.map((s) => (s.id === editStore.id ? result.store : s)),
          );
          closeForm();
          showToast({ type: 'success', title: t('storeUpdated') });
        } else {
          showToast({ type: 'error', title: result.error });
        }
      } else {
        const result = await createGroceryStoreAction({
          name: trimmedName,
          address: address.trim() || '',
          notes: notes.trim() || '',
          websiteUrl: websiteUrl.trim() || '',
          cutoffTimes: cutoffTimes.trim() || '',
        });
        if (result.ok) {
          setStores((prev) =>
            [...prev, result.store].sort(
              (a, b) =>
                a.sortOrder - b.sortOrder ||
                a.createdAt.localeCompare(b.createdAt),
            ),
          );
          closeForm();
          showToast({ type: 'success', title: t('storeAdded') });
        } else {
          showToast({ type: 'error', title: result.error });
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const result = await deleteGroceryStoreAction(id);
      if (result.ok) {
        setStores((prev) => prev.filter((s) => s.id !== id));
        setDeleteId(null);
        showToast({ type: 'success', title: t('storeDeleted') });
      } else {
        showToast({ type: 'error', title: result.error });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {stores.length === 0
            ? t('noStores')
            : t('storesCount', { count: stores.length })}
        </p>
        <div className="mt-4 sm:mt-0">
          <Button onClick={openAdd}>
            <PlusIcon className="size-4" />
            {t('addStore')}
          </Button>
        </div>
      </div>

      {stores.length === 0 ? (
        <div className="rounded-2xl bg-muted/20 p-8 shadow-sm">
          <p className="text-center text-muted-foreground">{t('noStores')}</p>
          <div className="mt-4 flex justify-center">
            <Button onClick={openAdd}>
              <PlusIcon className="size-4" />
              {t('addStore')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="min-w-full divide-y divide-white/10">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-foreground sm:pl-0"
                    >
                      {t('name')}
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-foreground"
                    >
                      {t('tableWebsite')}
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-foreground"
                    >
                      {t('tableCutoff')}
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-foreground"
                    >
                      {t('tableAddress')}
                    </th>
                    <th
                      scope="col"
                      className="relative py-3.5 pl-3 pr-4 sm:pr-0"
                    >
                      <span className="sr-only">{t('edit')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-muted/5">
                  {stores.map((store) => (
                    <tr key={store.id}>
                      <td className="whitespace-nowrap py-5 pl-4 pr-3 text-sm sm:pl-0">
                        <div className="flex items-center gap-4">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted/30 text-foreground outline outline-1 -outline-offset-1 outline-white/10">
                            <BuildingStorefrontIcon className="size-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">
                              {store.name}
                            </div>
                            <div className="mt-0.5 text-muted-foreground">
                              {store.websiteUrl ? (
                                <a
                                  href={store.websiteUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="truncate hover:underline"
                                >
                                  {store.websiteUrl
                                    .replace(/^https?:\/\//, '')
                                    .slice(0, 40)}
                                  {store.websiteUrl.replace(/^https?:\/\//, '')
                                    .length > 40
                                    ? '…'
                                    : ''}
                                </a>
                              ) : (
                                (store.address ?? '—')
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-5 text-sm text-muted-foreground">
                        {store.websiteUrl ? (
                          <a
                            href={store.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                          >
                            {t('viewStore')}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-5 text-sm text-muted-foreground">
                        <div className="max-w-[12rem] truncate">
                          {store.cutoffTimes ?? '—'}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-5 text-sm text-muted-foreground">
                        <div className="max-w-[12rem] truncate">
                          {store.address ?? '—'}
                        </div>
                      </td>
                      <td className="relative whitespace-nowrap py-5 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            plain
                            as={Link as never}
                            href={`/grocery-stores/${store.id}`}
                            aria-label={t('viewStore')}
                          >
                            {t('viewStore')}
                          </Button>
                          <Button
                            plain
                            onClick={() => openEdit(store)}
                            aria-label={t('edit')}
                          >
                            <PencilSquareIcon className="size-4" />
                          </Button>
                          <Button
                            plain
                            className="text-red-600 dark:text-red-400"
                            onClick={() => setDeleteId(store.id)}
                            aria-label={t('delete')}
                          >
                            <TrashIcon className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Dialog open={addOpen} onClose={closeForm}>
        <DialogTitle>
          {isEdit ? t('editStoreTitle') : t('addStore')}
        </DialogTitle>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>{t('name')}</Label>
              <Description>{t('nameRequired')}</Description>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                disabled={submitting}
              />
            </Field>
            <Field>
              <Label>{t('website')}</Label>
              <Description>{t('websitePlaceholder')}</Description>
              <Input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder={t('websitePlaceholder')}
                disabled={submitting}
              />
            </Field>
            <Field>
              <Label>{t('cutoffTimes')}</Label>
              <Description>{t('cutoffTimesPlaceholder')}</Description>
              <Input
                value={cutoffTimes}
                onChange={(e) => setCutoffTimes(e.target.value)}
                placeholder={t('cutoffTimesPlaceholder')}
                disabled={submitting}
              />
            </Field>
            <Field>
              <Label>{t('address')}</Label>
              <Description>{t('addressPlaceholder')}</Description>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t('addressPlaceholder')}
                disabled={submitting}
              />
            </Field>
            <Field>
              <Label>{t('notes')}</Label>
              <Description>{t('notesPlaceholder')}</Description>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('notesPlaceholder')}
                disabled={submitting}
                rows={2}
              />
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={closeForm} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={submitting || !name.trim()}>
            {submitting ? t('saving') : isEdit ? t('edit') : t('add')}
          </Button>
        </DialogActions>
      </Dialog>

      {deleteId && (
        <Dialog
          open={!!deleteId}
          onClose={() => !deleting && setDeleteId(null)}
        >
          <DialogTitle>{t('deleteConfirmTitle')}</DialogTitle>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              {t('deleteConfirmDescription', {
                name: stores.find((s) => s.id === deleteId)?.name ?? '',
              })}
            </p>
          </DialogBody>
          <DialogActions>
            <Button plain onClick={() => setDeleteId(null)} disabled={deleting}>
              {t('cancel')}
            </Button>
            <Button
              className="text-red-600 dark:text-red-400"
              onClick={() => handleDelete(deleteId)}
              disabled={deleting}
            >
              {deleting ? t('deleting') : t('delete')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}
