'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
} from '@/components/catalyst/dropdown';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogDescription,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Select } from '@/components/catalyst/select';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import {
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  TrashIcon,
  PhotoIcon,
  ArrowPathIcon,
  CheckIcon,
} from '@heroicons/react/16/solid';
import {
  updatePantryItemByIdAction,
  deletePantryItemByIdAction,
  uploadPantryItemImageAction,
} from '../actions/pantry-ui.actions';
import type { PantryLocation } from '@/src/lib/pantry/pantry.types';
import type { NutriScoreGrade } from '@/src/lib/nevo/nutrition-calculator';
import { useToast } from '@/src/components/app/ToastContext';

export type PantryCardItem = {
  id: string;
  nevoCode: string | null;
  barcode: string | null;
  source: 'openfoodfacts' | 'albert_heijn' | null;
  displayName: string | null;
  name: string;
  availableG: number | null;
  isAvailable: boolean;
  nutriscore: NutriScoreGrade | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  storageLocationId?: string | null;
  preferredStoreId?: string | null;
  availablePieces?: number | null;
};

type PantryCardProps = {
  item: PantryCardItem;
  pantryLocations?: PantryLocation[];
  onUpdate: () => void;
};

export function PantryCard({
  item,
  pantryLocations = [],
  onUpdate,
}: PantryCardProps) {
  const t = useTranslations('pantry');
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [editAvailableG, setEditAvailableG] = useState(
    item.availableG?.toString() ?? '',
  );
  const [editStorageLocationId, setEditStorageLocationId] = useState<string>(
    item.storageLocationId ?? '',
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePasteUrl, setImagePasteUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const parsedG =
        editAvailableG.trim() === '' ? null : parseFloat(editAvailableG.trim());
      if (parsedG !== null && (isNaN(parsedG) || parsedG < 0)) {
        showToast({
          type: 'error',
          title: t('quantity'),
          description: 'Hoeveelheid moet een positief getal zijn',
        });
        setIsSaving(false);
        return;
      }
      const result = await updatePantryItemByIdAction({
        id: item.id,
        availableG: parsedG,
        storageLocationId:
          editStorageLocationId.trim() === '' ? null : editStorageLocationId,
      });
      if (!result.ok) {
        showToast({ type: 'error', title: result.error.message });
        return;
      }
      if (imageFile) {
        setIsUploadingImage(true);
        const formData = new FormData();
        formData.set('pantryItemId', item.id);
        formData.set('image', imageFile);
        const uploadResult = await uploadPantryItemImageAction(formData);
        setIsUploadingImage(false);
        if (uploadResult.ok) {
          showToast({ type: 'success', title: t('imageUploaded') });
        } else {
          showToast({ type: 'error', title: uploadResult.error.message });
        }
      } else if (imagePasteUrl.trim()) {
        const urlResult = await updatePantryItemByIdAction({
          id: item.id,
          imageUrl: imagePasteUrl.trim(),
        });
        if (urlResult.ok) {
          showToast({ type: 'success', title: t('imageUploaded') });
        } else {
          showToast({ type: 'error', title: urlResult.error.message });
        }
      } else {
        showToast({ type: 'success', title: t('itemUpdated') });
      }
      setEditOpen(false);
      setImageFile(null);
      setImagePasteUrl('');
      onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deletePantryItemByIdAction(item.id);
      if (result.ok) {
        showToast({ type: 'success', title: t('itemDeleted') });
        setDeleteOpen(false);
        onUpdate();
      } else {
        showToast({ type: 'error', title: result.error.message });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const imageUrlToShow =
    imageFile && typeof URL !== 'undefined'
      ? URL.createObjectURL(imageFile)
      : imagePasteUrl.trim() || item.imageUrl;

  return (
    <>
      <li className="overflow-hidden rounded-xl bg-muted/20 shadow-sm outline outline-1 -outline-offset-1 outline-white/10">
        <div className="flex items-center gap-x-4 border-b border-white/10 bg-muted/30 px-6 py-4">
          <div className="size-12 flex-none overflow-hidden rounded-xl bg-muted/50 shadow-sm">
            {item.imageUrl ? (
              <img
                alt=""
                src={item.imageUrl}
                className="size-full object-cover"
              />
            ) : (
              <div
                className="flex size-full items-center justify-center text-muted-foreground"
                aria-hidden
              >
                <PhotoIcon className="size-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
            {item.name}
          </div>
          <div className="relative ml-auto">
            <Dropdown>
              <DropdownButton
                plain
                className="relative block text-muted-foreground hover:text-foreground"
              >
                <span className="absolute -inset-2.5" />
                <span className="sr-only">{t('edit')}</span>
                <EllipsisHorizontalIcon aria-hidden className="size-5" />
              </DropdownButton>
              <DropdownMenu anchor="bottom end" className="min-w-32">
                <DropdownItem onClick={() => setEditOpen(true)}>
                  <PencilSquareIcon data-slot="icon" />
                  {t('edit')}
                </DropdownItem>
                <DropdownItem
                  onClick={() => setDeleteOpen(true)}
                  className="text-destructive data-focus:bg-destructive/10 data-focus:text-destructive"
                >
                  <TrashIcon data-slot="icon" />
                  {t('delete')}
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
        <dl className="-my-3 divide-y divide-white/10 px-6 py-4 text-sm">
          <div className="flex justify-between gap-x-4 py-3">
            <dt className="text-muted-foreground">{t('quantity')}</dt>
            <dd className="font-medium text-foreground">
              {item.availableG != null
                ? `${item.availableG} g`
                : item.isAvailable
                  ? t('onStock')
                  : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-x-4 py-3">
            <dt className="text-muted-foreground">{t('location')}</dt>
            <dd className="text-foreground">
              {item.storageLocationId
                ? (pantryLocations.find((l) => l.id === item.storageLocationId)
                    ?.name ?? t('locationNotSet'))
                : t('locationNotSet')}
            </dd>
          </div>
        </dl>
      </li>

      <Dialog open={editOpen} onClose={setEditOpen}>
        <DialogTitle>{t('edit')}</DialogTitle>
        <DialogDescription>{item.name}</DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                {t('quantityG')}
              </span>
              <Input
                type="number"
                min={0}
                step={1}
                value={editAvailableG}
                onChange={(e) => setEditAvailableG(e.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                {t('location')}
              </span>
              <Select
                value={editStorageLocationId}
                onChange={(e) => setEditStorageLocationId(e.target.value)}
                className="mt-1"
              >
                <option value="">{t('locationNotSet')}</option>
                {pantryLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </Select>
            </label>
            <div>
              <span className="text-sm font-medium text-foreground">
                {t('changeImage')}
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setImageFile(f);
                      setImagePasteUrl('');
                    }
                  }}
                />
                <Button
                  outline
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                >
                  {isUploadingImage ? (
                    <ArrowPathIcon className="size-4 animate-spin" />
                  ) : (
                    t('uploadImage')
                  )}
                </Button>
                <Input
                  type="url"
                  placeholder={t('pasteImage')}
                  value={imagePasteUrl}
                  onChange={(e) => {
                    setImagePasteUrl(e.target.value);
                    if (e.target.value.trim()) setImageFile(null);
                  }}
                  className="max-w-xs"
                />
              </div>
              {imageUrlToShow && (
                <div className="mt-2 size-20 overflow-hidden rounded-lg bg-muted/30">
                  <img
                    src={imageUrlToShow}
                    alt=""
                    className="size-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setEditOpen(false)}>
            {t('close')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <ArrowPathIcon className="size-4 animate-spin" />
            ) : (
              <>
                <CheckIcon className="size-4" />
                {t('save')}
              </>
            )}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('delete')}
        description={t('deleteItemConfirm', { name: item.name })}
        confirmLabel={t('delete')}
        cancelLabel={t('close')}
        confirmColor="red"
        isLoading={isDeleting}
      />
    </>
  );
}
