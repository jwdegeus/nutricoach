'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/components/catalyst/link';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogDescription,
} from '@/components/catalyst/dialog';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import {
  ArrowLeftIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/16/solid';
import {
  listUserPantryLocationsAction,
  createUserPantryLocationAction,
  updateUserPantryLocationAction,
  deleteUserPantryLocationAction,
  seedDefaultPantryLocationsAction,
} from '../actions/pantry-locations.actions';
import type { PantryLocation } from '@/src/lib/pantry/pantry.types';
import { useToast } from '@/src/components/app/ToastContext';

export function PantrySettingsPageClient() {
  const t = useTranslations('pantry');
  const { showToast } = useToast();
  const [locations, setLocations] = useState<PantryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<PantryLocation | null>(
    null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingLocation, setDeletingLocation] =
    useState<PantryLocation | null>(null);
  const [newName, setNewName] = useState('');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const _loadLocations = async () => {
    const result = await listUserPantryLocationsAction();
    if (result.ok) {
      setLocations(result.data);
    } else {
      showToast({ type: 'error', title: result.error.message });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await listUserPantryLocationsAction();
      if (cancelled) return;
      if (result.ok) {
        setLocations(result.data);
      } else {
        showToast({ type: 'error', title: result.error.message });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const handleSeedDefaults = async () => {
    setSaving(true);
    try {
      const result = await seedDefaultPantryLocationsAction();
      if (result.ok) {
        setLocations(result.data);
        showToast({ type: 'success', title: t('locationCreated') });
      } else {
        showToast({ type: 'error', title: result.error.message });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) {
      showToast({
        type: 'error',
        title: t('locationName'),
        description: 'Naam is verplicht',
      });
      return;
    }
    setSaving(true);
    try {
      const result = await createUserPantryLocationAction({ name });
      if (result.ok) {
        setLocations((prev) =>
          [...prev, result.data].sort((a, b) => a.sortOrder - b.sortOrder),
        );
        setNewName('');
        setAddOpen(false);
        showToast({ type: 'success', title: t('locationCreated') });
      } else {
        showToast({ type: 'error', title: result.error.message });
      }
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (loc: PantryLocation) => {
    setEditingLocation(loc);
    setEditName(loc.name);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editingLocation) return;
    const name = editName.trim();
    if (!name) {
      showToast({
        type: 'error',
        title: t('locationName'),
        description: 'Naam mag niet leeg zijn',
      });
      return;
    }
    setSaving(true);
    try {
      const result = await updateUserPantryLocationAction({
        id: editingLocation.id,
        name,
      });
      if (result.ok) {
        setLocations((prev) =>
          prev.map((l) => (l.id === editingLocation.id ? { ...l, name } : l)),
        );
        setEditOpen(false);
        setEditingLocation(null);
        showToast({ type: 'success', title: t('locationUpdated') });
      } else {
        showToast({ type: 'error', title: result.error.message });
      }
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (loc: PantryLocation) => {
    setDeletingLocation(loc);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingLocation) return;
    setDeleting(true);
    try {
      const result = await deleteUserPantryLocationAction(deletingLocation.id);
      if (result.ok) {
        setLocations((prev) =>
          prev.filter((l) => l.id !== deletingLocation.id),
        );
        setDeleteOpen(false);
        setDeletingLocation(null);
        showToast({ type: 'success', title: t('locationDeleted') });
      } else {
        showToast({ type: 'error', title: result.error.message });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/pantry"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            {t('title')}
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">
            {t('settingsTitle')}
          </h1>
          <p className="text-muted-foreground">{t('settingsDescription')}</p>
        </div>
      </div>

      <section
        className="rounded-2xl bg-muted/20 p-6 shadow-sm"
        aria-labelledby="locations-heading"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="locations-heading"
              className="text-lg font-semibold text-foreground"
            >
              {t('locationsSection')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('locationsDescription')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {locations.length === 0 && (
              <Button outline onClick={handleSeedDefaults} disabled={saving}>
                {saving ? t('saving') : t('loadDefaultLocations')}
              </Button>
            )}
            <Button onClick={() => setAddOpen(true)}>
              <PlusIcon className="size-4" />
              {t('addLocation')}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('loading')}</p>
        ) : locations.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {t('noLocationsYet')} {t('addFirstLocation')}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {locations.map((loc) => (
              <li
                key={loc.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <span className="font-medium text-foreground">{loc.name}</span>
                <div className="flex gap-2">
                  <Button
                    plain
                    onClick={() => openEdit(loc)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <PencilSquareIcon className="size-4" />
                    <span className="sr-only">{t('editLocation')}</span>
                  </Button>
                  <Button
                    plain
                    onClick={() => openDelete(loc)}
                    className="text-destructive hover:text-destructive"
                  >
                    <TrashIcon className="size-4" />
                    <span className="sr-only">{t('deleteLocation')}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          {t('defaultLocationsNote')}
        </p>
      </section>

      <Dialog open={addOpen} onClose={setAddOpen}>
        <DialogTitle>{t('addLocation')}</DialogTitle>
        <DialogDescription>{t('locationsDescription')}</DialogDescription>
        <DialogBody>
          <label className="block">
            <span className="text-sm font-medium text-foreground">
              {t('locationName')}
            </span>
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('locationNamePlaceholder')}
              className="mt-1"
            />
          </label>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setAddOpen(false)}>
            {t('close')}
          </Button>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditingLocation(null);
        }}
      >
        <DialogTitle>{t('editLocation')}</DialogTitle>
        <DialogDescription>
          {editingLocation?.name ?? t('locationName')}
        </DialogDescription>
        <DialogBody>
          <label className="block">
            <span className="text-sm font-medium text-foreground">
              {t('locationName')}
            </span>
            <Input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t('locationNamePlaceholder')}
              className="mt-1"
            />
          </label>
        </DialogBody>
        <DialogActions>
          <Button
            plain
            onClick={() => {
              setEditOpen(false);
              setEditingLocation(null);
            }}
          >
            {t('close')}
          </Button>
          <Button onClick={handleEdit} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeletingLocation(null);
        }}
        onConfirm={handleDelete}
        title={t('deleteLocation')}
        description={
          deletingLocation
            ? t('confirmDeleteLocation', { name: deletingLocation.name })
            : ''
        }
        confirmLabel={t('delete')}
        cancelLabel={t('close')}
        isLoading={deleting}
        confirmColor="red"
      />
    </div>
  );
}
