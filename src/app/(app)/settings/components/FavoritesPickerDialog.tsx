'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Badge } from '@/components/catalyst/badge';
import { Text } from '@/components/catalyst/text';
import { searchFavoriteMealCandidatesAction } from '../actions/meal-plan-schedule-preferences.actions';
import type { MealCandidate } from '../actions/meal-plan-schedule-preferences.actions';
import { useTranslations } from 'next-intl';

const MAX_FAVORITES = 10;

/** MealSlot → Nederlands label voor weergave */
const MEAL_SLOT_LABEL_NL: Record<string, string> = {
  breakfast: 'Ontbijt',
  lunch: 'Lunch',
  dinner: 'Diner',
  snack: 'Snack',
};

function mealSlotLabel(slot: string): string {
  return MEAL_SLOT_LABEL_NL[slot] ?? slot;
}

export type FavoriteLabel = { name: string; mealSlot: string };

type FavoritesPickerDialogProps = {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  /** Optioneel: deel labels-cache naar form (alleen geselecteerde ids). */
  onLabels?: (labels: Record<string, FavoriteLabel>) => void;
};

/**
 * Favorites picker: zoek custom_meals, selecteer max 10. Houdt lokaal byId bij voor badge-labels.
 */
export function FavoritesPickerDialog({
  open,
  onClose,
  selectedIds,
  onChange,
  onLabels,
}: FavoritesPickerDialogProps) {
  const t = useTranslations('settings');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MealCandidate[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [localIds, setLocalIds] = useState<string[]>(selectedIds);
  const [byId, setById] = useState<
    Record<string, { name: string; mealSlot: string }>
  >({});

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setLocalIds(selectedIds);
        setSearchQuery('');
        setSearchResults([]);
        setSearchError(null);
      });
    }
  }, [open, selectedIds]);

  const runSearch = useCallback(async () => {
    setSearchLoading(true);
    setSearchError(null);
    const result = await searchFavoriteMealCandidatesAction({
      q: searchQuery.trim() || undefined,
      limit: 20,
    });
    setSearchLoading(false);
    if (result.ok) {
      setSearchResults(result.data);
      setById((prev) => {
        const next = { ...prev };
        for (const row of result.data) {
          if (localIds.includes(row.id)) {
            next[row.id] = {
              name: row.name,
              mealSlot: mealSlotLabel(row.mealSlot),
            };
          }
        }
        return next;
      });
    } else {
      setSearchResults([]);
      setSearchError(result.error);
    }
  }, [searchQuery, localIds]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(runSearch, 300);
    return () => clearTimeout(id);
  }, [open, searchQuery, runSearch]);

  const addFavorite = (candidate: MealCandidate) => {
    if (localIds.length >= MAX_FAVORITES) return;
    if (localIds.includes(candidate.id)) return;
    setLocalIds((prev) => [...prev, candidate.id].slice(0, MAX_FAVORITES));
    setById((prev) => ({
      ...prev,
      [candidate.id]: {
        name: candidate.name,
        mealSlot: mealSlotLabel(candidate.mealSlot),
      },
    }));
  };

  const removeFavorite = (id: string) => {
    setLocalIds((prev) => prev.filter((x) => x !== id));
    setById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleDone = () => {
    const nextIds = localIds.slice(0, MAX_FAVORITES);
    onChange(nextIds);
    if (onLabels) {
      const labels: Record<string, FavoriteLabel> = {};
      for (const id of nextIds) {
        if (byId[id]) labels[id] = byId[id];
      }
      onLabels(labels);
    }
    onClose();
  };

  const atMax = localIds.length >= MAX_FAVORITES;

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>{t('favoritesPickerTitle')}</DialogTitle>
      <DialogBody>
        <div className="space-y-4">
          <div>
            <label htmlFor="favorites-search" className="sr-only">
              {t('favoritesSearchPlaceholder')}
            </label>
            <Input
              id="favorites-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('favoritesSearchPlaceholder')}
              disabled={searchLoading}
              className="w-full"
            />
          </div>

          {searchError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
            >
              {searchError}
            </div>
          )}

          {atMax && (
            <Text className="text-sm text-amber-600 dark:text-amber-400">
              {t('favoritesMaxReached')}
            </Text>
          )}

          <div>
            <Text className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('favoritesSelectedLabel')} ({localIds.length}/{MAX_FAVORITES})
            </Text>
            <div className="flex flex-wrap gap-2">
              {localIds.map((id) => (
                <Badge key={id} className="flex items-center gap-1">
                  {byId[id]?.name ?? id}
                  {byId[id]?.mealSlot && (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      ({byId[id].mealSlot})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFavorite(id)}
                    className="ml-1 rounded hover:bg-white/20 dark:hover:bg-white/10"
                    aria-label={t('favoritesRemove')}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Text className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('favoritesSearchResults')}
            </Text>
            {searchLoading ? (
              <Text className="text-sm text-zinc-500">
                {t('favoritesSearching')}
              </Text>
            ) : searchResults.length === 0 && !searchError ? (
              <Text className="text-sm text-zinc-500">
                {t('favoritesNoResults')}
              </Text>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                {searchResults.map((row) => {
                  const isSelected = localIds.includes(row.id);
                  const canAdd = !isSelected && localIds.length < MAX_FAVORITES;
                  return (
                    <li
                      key={row.id}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                    >
                      <span>
                        {row.name}
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {' '}
                          ({mealSlotLabel(row.mealSlot)})
                        </span>
                      </span>
                      {canAdd ? (
                        <Button
                          type="button"
                          outline
                          onClick={() => addFavorite(row)}
                        >
                          {t('favoritesAdd')}
                        </Button>
                      ) : isSelected ? (
                        <Button
                          type="button"
                          outline
                          onClick={() => removeFavorite(row.id)}
                        >
                          {t('favoritesRemove')}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button outline onClick={onClose}>
          {t('favoritesCancel')}
        </Button>
        <Button onClick={handleDone}>{t('favoritesDone')}</Button>
      </DialogActions>
    </Dialog>
  );
}
