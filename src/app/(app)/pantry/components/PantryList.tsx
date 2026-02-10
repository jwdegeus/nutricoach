'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PantryCardItem } from './PantryCard';
import type { GroceryStoreRow } from '@/src/lib/grocery-stores/grocery-stores.types';
import type { PantryLocation } from '@/src/lib/pantry/pantry.types';
import { PantryRow } from './PantryRow';
import { Button } from '@/components/catalyst/button';
import {
  Table,
  TableHead,
  TableBody,
  TableHeader,
} from '@/components/catalyst/table';
import { deleteAllPantryItemsAction } from '../actions/pantry-ui.actions';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import { TrashIcon, ArrowPathIcon } from '@heroicons/react/16/solid';

export type PantryItemWithName = PantryCardItem;

type PantryListProps = {
  items: PantryItemWithName[];
  groceryStores: GroceryStoreRow[];
  pantryLocations: PantryLocation[];
  onUpdate: () => void;
};

export function PantryList({
  items,
  groceryStores,
  pantryLocations,
  onUpdate,
}: PantryListProps) {
  const t = useTranslations('pantry');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClearAll = async () => {
    setIsClearing(true);
    setError(null);
    try {
      const result = await deleteAllPantryItemsAction();
      if (result.ok) {
        setShowClearDialog(false);
        onUpdate();
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Fout bij leegmaken pantry',
      );
    } finally {
      setIsClearing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {t('myPantry')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('emptyPantry')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          {t('myPantryCount', { count: items.length })}
        </h2>
        <Button
          plain
          onClick={() => setShowClearDialog(true)}
          disabled={isClearing}
          className="text-destructive hover:text-destructive"
        >
          {isClearing ? (
            <>
              <ArrowPathIcon className="mr-1 size-4 animate-spin" />
              {t('saving')}
            </>
          ) : (
            <>
              <TrashIcon className="mr-1 size-4" />
              {t('clearPantry')}
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="-mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <Table className="min-w-full divide-y divide-white/10">
            <TableHead>
              <tr>
                <TableHeader className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-foreground sm:pl-0">
                  {t('product')}
                </TableHeader>
                <TableHeader className="px-3 py-3.5 text-left text-sm font-semibold text-foreground">
                  {t('source')}
                </TableHeader>
                <TableHeader className="px-3 py-3.5 text-left text-sm font-semibold text-foreground">
                  {t('quantity')}
                </TableHeader>
                <TableHeader className="px-3 py-3.5 text-left text-sm font-semibold text-foreground">
                  {t('shop')}
                </TableHeader>
                <TableHeader className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                  <span className="sr-only">{t('edit')}</span>
                </TableHeader>
              </tr>
            </TableHead>
            <TableBody className="divide-y divide-white/10 bg-muted/10">
              {items.map((item) => (
                <PantryRow
                  key={item.id}
                  item={item}
                  groceryStores={groceryStores}
                  pantryLocations={pantryLocations}
                  onUpdate={onUpdate}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <ConfirmDialog
        open={showClearDialog}
        onClose={() => {
          setShowClearDialog(false);
          setError(null);
        }}
        onConfirm={handleClearAll}
        title={t('clearPantry')}
        description={t('clearPantryConfirm', { count: items.length })}
        confirmLabel={t('clearPantry')}
        cancelLabel={t('close')}
        confirmColor="red"
        isLoading={isClearing}
      />
    </div>
  );
}
