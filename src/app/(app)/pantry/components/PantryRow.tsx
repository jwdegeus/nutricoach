'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import { TableRow, TableCell } from '@/components/catalyst/table';
import {
  EllipsisVerticalIcon,
  PencilSquareIcon,
  TrashIcon,
  PhotoIcon,
  ArrowPathIcon,
  CheckIcon,
} from '@heroicons/react/16/solid';
import { Link } from '@/components/catalyst/link';
import {
  updatePantryItemByIdAction,
  deletePantryItemByIdAction,
  uploadPantryItemImageAction,
} from '../actions/pantry-ui.actions';
import type { PantryCardItem } from './PantryCard';
import type { PantryLocation } from '@/src/lib/pantry/pantry.types';
import type { GroceryStoreRow } from '@/src/lib/grocery-stores/grocery-stores.types';
import { useToast } from '@/src/components/app/ToastContext';

function sourceLabelKey(
  source: PantryCardItem['source'],
): 'sourceOpenFoodFacts' | 'sourceAlbertHeijn' | 'sourceNevo' | null {
  if (source === 'openfoodfacts') return 'sourceOpenFoodFacts';
  if (source === 'albert_heijn') return 'sourceAlbertHeijn';
  if (source === null) return 'sourceNevo'; // NEVO items have no source
  return null;
}

type PantryRowProps = {
  item: PantryCardItem;
  groceryStores: GroceryStoreRow[];
  pantryLocations: PantryLocation[];
  onUpdate: () => void;
};

export function PantryRow({
  item,
  groceryStores,
  pantryLocations,
  onUpdate,
}: PantryRowProps) {
  const t = useTranslations('pantry');
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [editAvailablePieces, setEditAvailablePieces] = useState(
    item.availablePieces?.toString() ?? '',
  );
  const [editStorageLocationId, setEditStorageLocationId] = useState<string>(
    item.storageLocationId ?? '',
  );
  const [editPreferredStoreId, setEditPreferredStoreId] = useState<string>(
    item.preferredStoreId ?? '',
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePasteUrl, setImagePasteUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const parsedPieces =
        editAvailablePieces.trim() === ''
          ? null
          : parseInt(editAvailablePieces.trim(), 10);
      if (parsedPieces !== null && (isNaN(parsedPieces) || parsedPieces < 0)) {
        showToast({
          type: 'error',
          title: t('quantityPieces'),
          description: 'Aantal stuks moet een positief getal zijn',
        });
        setIsSaving(false);
        return;
      }
      const result = await updatePantryItemByIdAction({
        id: item.id,
        availablePieces: parsedPieces,
        storageLocationId:
          editStorageLocationId.trim() === '' ? null : editStorageLocationId,
        preferredStoreId:
          editPreferredStoreId.trim() === ''
            ? null
            : editPreferredStoreId.trim(),
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

  const sourceKey = sourceLabelKey(item.source);
  const quantityText =
    item.availablePieces != null
      ? `${item.availablePieces} ${t('pieces')}`
      : item.availableG != null
        ? `${item.availableG} g`
        : item.isAvailable
          ? t('onStock')
          : '—';

  const dialogs = (
    <>
      {editOpen && (
        <Dialog open onClose={setEditOpen}>
          <DialogTitle>{t('edit')}</DialogTitle>
          <DialogDescription>{item.name}</DialogDescription>
          <DialogBody>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {t('quantityPieces')}
                </span>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={editAvailablePieces}
                  onChange={(e) => setEditAvailablePieces(e.target.value)}
                  className="mt-1"
                  placeholder={t('quantityPieces')}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {t('location')}
                </span>
                <Listbox
                  value={editStorageLocationId}
                  onChange={(val) => setEditStorageLocationId(val)}
                  className="mt-1"
                  aria-label={t('locationNotSet')}
                >
                  <ListboxOption value="">{t('locationNotSet')}</ListboxOption>
                  {pantryLocations.map((loc) => (
                    <ListboxOption key={loc.id} value={loc.id}>
                      {loc.name}
                    </ListboxOption>
                  ))}
                </Listbox>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  {t('linkToStore')}
                </span>
                <Listbox
                  value={editPreferredStoreId}
                  onChange={(val) => setEditPreferredStoreId(val)}
                  className="mt-1"
                  aria-label={t('storeNotSet')}
                >
                  <ListboxOption value="">{t('storeNotSet')}</ListboxOption>
                  {groceryStores.map((store) => (
                    <ListboxOption key={store.id} value={store.id}>
                      {store.name}
                    </ListboxOption>
                  ))}
                </Listbox>
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
                    placeholder={t('pasteImageUrlLabel')}
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
      )}

      {deleteOpen && (
        <ConfirmDialog
          open
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
          title={t('delete')}
          description={t('deleteItemConfirm', { name: item.name })}
          confirmLabel={t('delete')}
          cancelLabel={t('close')}
          confirmColor="red"
          isLoading={isDeleting}
        />
      )}
    </>
  );

  return (
    <TableRow>
      <TableCell className="py-4 whitespace-nowrap">
        <div className="flex items-center gap-3">
          <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted/30 shadow-sm outline outline-1 -outline-offset-1 outline-white/10">
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
          <div className="min-w-0">
            <div className="font-medium text-foreground">{item.name}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {item.storageLocationId
                ? (pantryLocations.find((l) => l.id === item.storageLocationId)
                    ?.name ?? t('locationNotSet'))
                : t('locationNotSet')}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="py-4">
        {sourceKey ? (
          <span className="inline-flex items-center rounded-md bg-muted/40 px-2 py-1 text-xs font-medium text-foreground outline outline-1 -outline-offset-1 outline-white/10">
            {t(sourceKey)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="py-4 whitespace-nowrap text-muted-foreground">
        {quantityText}
      </TableCell>
      <TableCell className="py-4">
        {item.productUrl ? (
          <Link
            href={item.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
          >
            {item.source === 'albert_heijn'
              ? t('orderAtAh')
              : item.source === 'openfoodfacts'
                ? t('viewOnOff')
                : t('view')}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="relative py-4 text-right">
        <div className="inline-block">
          <Dropdown>
            <DropdownButton
              plain
              className="relative text-muted-foreground hover:text-foreground"
            >
              <span className="sr-only">{t('edit')}</span>
              <EllipsisVerticalIcon aria-hidden className="size-5" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end" className="min-w-32">
              <DropdownItem
                onClick={() => {
                  setEditPreferredStoreId(item.preferredStoreId ?? '');
                  setEditOpen(true);
                }}
              >
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
        {typeof document !== 'undefined' &&
          createPortal(dialogs, document.body)}
      </TableCell>
    </TableRow>
  );
}
