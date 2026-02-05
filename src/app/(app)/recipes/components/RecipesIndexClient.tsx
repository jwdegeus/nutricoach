'use client';

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/catalyst/badge';
import { Button } from '@/components/catalyst/button';
import { Input, InputGroup } from '@/components/catalyst/input';
import { Link } from '@/components/catalyst/link';
import { Text } from '@/components/catalyst/text';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Select } from '@/components/catalyst/select';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
} from '@/components/catalyst/dropdown';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  ChevronDownIcon,
  QueueListIcon,
  ClockIcon,
  DocumentTextIcon,
  TagIcon,
  Square3Stack3DIcon,
  PhotoIcon,
} from '@heroicons/react/20/solid';
import { BookmarkIcon as BookmarkIconSolid } from '@heroicons/react/16/solid';
import { BookmarkIcon as BookmarkIconOutline } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { useToast } from '@/src/components/app/ToastContext';
import { setMealFavoritedAction } from '../actions/meal-favorites.actions';
import { listMealsAction } from '../actions/meal-list.actions';
import { listRecentMealsAction } from '../actions/meal-recent.actions';
import type {
  MealListItem,
  ListMealsOutput,
  MealSlotValue,
} from '../actions/meal-list.actions';

const MEAL_SLOT_OPTIONS: { value: MealSlotValue; label: string }[] = [
  { value: 'breakfast', label: 'Ontbijt' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Diner' },
  { value: 'snack', label: 'Snack' },
  { value: 'other', label: 'Overig' },
];

const TIME_PRESETS: { value: number | null; label: string }[] = [
  { value: 15, label: '≤15 min' },
  { value: 30, label: '15–30 min' },
  { value: 60, label: '30–60 min' },
  { value: null, label: '60+ min' },
];

function formatMealSlot(slot: MealSlotValue | null): string {
  if (!slot) return '';
  return MEAL_SLOT_OPTIONS.find((o) => o.value === slot)?.label ?? slot;
}

type CollectionValue = 'all' | 'saved' | 'recent';

function buildQueryString(
  updates: Record<string, string | number | string[] | null | undefined>,
): string {
  const params = new URLSearchParams();
  const set = (k: string, v: string | number | string[] | null | undefined) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) {
      params.set(k, v.join(','));
      return;
    }
    params.set(k, String(v));
  };
  if (updates.collection === 'saved') {
    params.set('collection', 'saved');
  } else if (updates.collection === 'recent') {
    params.set('collection', 'recent');
  } else {
    params.delete('collection');
  }
  set('q', updates.q);
  set('mealSlot', updates.mealSlot);
  set('maxTotalMinutes', updates.maxTotalMinutes);
  set('sourceName', updates.sourceName);
  if (updates.cuisine !== undefined) {
    if (updates.cuisine && String(updates.cuisine).trim())
      params.set('cuisine', String(updates.cuisine));
    else params.delete('cuisine');
  }
  if (updates.protein !== undefined) {
    if (updates.protein && String(updates.protein).trim())
      params.set('protein', String(updates.protein));
    else params.delete('protein');
  }
  if (Array.isArray(updates.tags) && updates.tags.length > 0) {
    params.set('tags', (updates.tags as string[]).join(','));
  } else if (updates.tags === null || updates.tags === '') {
    params.delete('tags');
  }
  set('limit', updates.limit ?? 12);
  set('offset', updates.offset ?? 0);
  const s = params.toString();
  return s ? `?${s}` : '';
}

function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = params[key];
  return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';
}

function getTags(
  params: Record<string, string | string[] | undefined>,
): string[] {
  const t = params.tags;
  if (typeof t === 'string' && t.trim())
    return t
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  if (Array.isArray(t))
    return t
      .flatMap((x) =>
        typeof x === 'string' ? x.split(',').map((s) => s.trim()) : [],
      )
      .filter(Boolean);
  return [];
}

export type CatalogOptionItem = {
  id: string;
  label: string;
  isActive?: boolean;
};

type RecipesIndexClientProps = {
  listResult: ListMealsOutput;
  searchParams: Record<string, string | string[] | undefined>;
  cuisineOptions?: CatalogOptionItem[];
  proteinTypeOptions?: CatalogOptionItem[];
  catalogLoadError?: string;
};

export function RecipesIndexClient({
  listResult,
  searchParams,
  cuisineOptions = [],
  proteinTypeOptions = [],
  catalogLoadError,
}: RecipesIndexClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(() =>
    getParam(searchParams, 'q'),
  );
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [favoritedByMealId, setFavoritedByMealId] = useState<
    Record<string, boolean>
  >({});
  const [favoriteSavingByMealId, setFavoriteSavingByMealId] = useState<
    Record<string, boolean>
  >({});
  const [filterCloseKeys, setFilterCloseKeys] = useState({
    soort: 0,
    tijd: 0,
    bron: 0,
    tags: 0,
    cuisine: 0,
    protein: 0,
  });
  const closeFilter = useCallback((filter: keyof typeof filterCloseKeys) => {
    setFilterCloseKeys((k) => ({ ...k, [filter]: k[filter] + 1 }));
  }, []);

  const [extraItems, setExtraItems] = useState<MealListItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // Reset extra items when server result changes (e.g. filter/tab change)
  useEffect(() => {
    setExtraItems([]);
  }, [listResult]);

  const collectionParam = getParam(searchParams, 'collection');
  const activeCollection: CollectionValue =
    collectionParam === 'saved'
      ? 'saved'
      : collectionParam === 'recent'
        ? 'recent'
        : 'all';
  const q = getParam(searchParams, 'q');
  const mealSlot =
    (getParam(searchParams, 'mealSlot') as MealSlotValue | '') || undefined;
  const maxTotalMinutesParam = getParam(searchParams, 'maxTotalMinutes');
  const maxTotalMinutes =
    maxTotalMinutesParam === ''
      ? undefined
      : parseInt(maxTotalMinutesParam, 10);
  const sourceName = getParam(searchParams, 'sourceName');
  const tags = getTags(searchParams);
  const cuisineParam = getParam(searchParams, 'cuisine');
  const proteinParam = getParam(searchParams, 'protein');

  const hasAnyFilter =
    q !== '' ||
    mealSlot != null ||
    (maxTotalMinutes != null && Number.isFinite(maxTotalMinutes)) ||
    sourceName !== '' ||
    tags.length > 0 ||
    cuisineParam !== '' ||
    proteinParam !== '';

  const setCollection = useCallback(
    (next: CollectionValue) => {
      const nextUrl = buildQueryString({
        collection: next,
        q,
        mealSlot: mealSlot || undefined,
        maxTotalMinutes,
        sourceName,
        cuisine: cuisineParam || undefined,
        protein: proteinParam || undefined,
        tags,
        limit: listResult.limit,
        offset: 0,
      });
      router.push(`/recipes${nextUrl}`);
    },
    [
      router,
      q,
      mealSlot,
      maxTotalMinutes,
      sourceName,
      cuisineParam,
      proteinParam,
      tags,
      listResult.limit,
    ],
  );

  // Sync zoekveld met URL bij navigatie (bv. terug-knop)
  useEffect(() => {
    setSearchInput(getParam(searchParams, 'q'));
  }, [searchParams, q]);

  // Sync favorited state vanuit listResult.items (geen N+1; server levert isFavorited)
  useEffect(() => {
    setFavoritedByMealId((prev) => ({
      ...prev,
      ...Object.fromEntries(
        listResult.items.map((i) => [i.mealId, i.isFavorited]),
      ),
    }));
  }, [listResult.items]);

  const handleToggleFavorite = useCallback(
    async (mealId: string) => {
      const current = favoritedByMealId[mealId] ?? false;
      const next = !current;
      setFavoritedByMealId((prev) => ({ ...prev, [mealId]: next }));
      setFavoriteSavingByMealId((prev) => ({ ...prev, [mealId]: true }));
      const result = await setMealFavoritedAction({
        mealId,
        isFavorited: next,
      });
      setFavoriteSavingByMealId((prev) => ({ ...prev, [mealId]: false }));
      if (result.ok) {
        setFavoritedByMealId((prev) => ({
          ...prev,
          [mealId]: result.data.isFavorited,
        }));
        if (activeCollection === 'saved' && !result.data.isFavorited) {
          router.refresh();
        }
      } else {
        setFavoritedByMealId((prev) => ({ ...prev, [mealId]: current }));
        showToast({
          type: 'error',
          title: next
            ? 'Opslaan mislukt'
            : 'Verwijderen uit opgeslagen mislukt',
          description: result.error.message,
        });
      }
    },
    [favoritedByMealId, activeCollection, router, showToast],
  );

  const pushParams = useCallback(
    (
      updates: Record<string, string | number | string[] | null | undefined>,
    ) => {
      const next = buildQueryString({
        collection: (updates.collection as CollectionValue) ?? activeCollection,
        q: updates.q ?? q,
        mealSlot: updates.mealSlot ?? mealSlot ?? undefined,
        maxTotalMinutes:
          updates.maxTotalMinutes !== undefined
            ? updates.maxTotalMinutes
            : maxTotalMinutes,
        sourceName: updates.sourceName ?? sourceName,
        cuisine:
          updates.cuisine !== undefined
            ? updates.cuisine
            : cuisineParam || undefined,
        protein:
          updates.protein !== undefined
            ? updates.protein
            : proteinParam || undefined,
        tags: updates.tags !== undefined ? updates.tags : tags,
        limit: listResult.limit,
        offset: 0,
      });
      router.push(`/recipes${next}`);
    },
    [
      router,
      activeCollection,
      q,
      mealSlot,
      maxTotalMinutes,
      sourceName,
      cuisineParam,
      proteinParam,
      tags,
      listResult.limit,
    ],
  );

  const clearFilters = useCallback(() => {
    router.push('/recipes');
    setSearchInput('');
    setTagInput('');
  }, [router]);

  const handleTabAlles = useCallback(
    () => setCollection('all'),
    [setCollection],
  );
  const handleTabOpgeslagen = useCallback(
    () => setCollection('saved'),
    [setCollection],
  );
  const handleTabRecent = useCallback(
    () => setCollection('recent'),
    [setCollection],
  );

  const removeFilter = useCallback(
    (
      key:
        | 'q'
        | 'mealSlot'
        | 'maxTotalMinutes'
        | 'sourceName'
        | 'tag'
        | 'cuisine'
        | 'protein',
      value?: string,
    ) => {
      if (key === 'q') pushParams({ q: '' });
      else if (key === 'mealSlot') pushParams({ mealSlot: undefined });
      else if (key === 'maxTotalMinutes')
        pushParams({ maxTotalMinutes: undefined });
      else if (key === 'sourceName') pushParams({ sourceName: '' });
      else if (key === 'cuisine') pushParams({ cuisine: '' });
      else if (key === 'protein') pushParams({ protein: '' });
      else if (key === 'tag' && value !== undefined)
        pushParams({ tags: tags.filter((t) => t !== value) });
    },
    [pushParams, tags],
  );

  const handleSearchSubmit = useCallback(() => {
    pushParams({ q: searchInput.trim() });
  }, [pushParams, searchInput]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSearchSubmit();
    },
    [handleSearchSubmit],
  );

  const _handleAddTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t)) {
      setTagInput('');
      return;
    }
    pushParams({ tags: [...tags, t] });
    setTagInput('');
    tagInputRef.current?.focus();
  }, [pushParams, tags, tagInput]);

  const _applyDrawer = useCallback(
    (drawer: {
      mealSlot?: string;
      maxTotalMinutes?: number | null;
      sourceName?: string;
      maxMinutesInput?: string;
    }) => {
      pushParams({
        mealSlot: drawer.mealSlot || undefined,
        maxTotalMinutes: drawer.maxTotalMinutes,
        sourceName: drawer.sourceName ?? sourceName,
      });
      setDrawerOpen(false);
    },
    [pushParams, sourceName],
  );

  const { totalCount } = listResult;
  const items = useMemo(() => {
    const combined = listResult.items.concat(extraItems);
    const seen = new Set<string>();
    return combined.filter((item) => {
      if (seen.has(item.mealId)) return false;
      seen.add(item.mealId);
      return true;
    });
  }, [listResult.items, extraItems]);

  const loadMore = useCallback(async () => {
    if (loadingMore || totalCount == null || items.length >= totalCount) return;
    setLoadingMore(true);
    try {
      if (activeCollection === 'recent') {
        const result = await listRecentMealsAction({
          limit: 6,
          offset: items.length,
        });
        if (result.ok && result.data.items.length > 0) {
          const next = result.data.items;
          setExtraItems((prev) => [...prev, ...next]);
          setFavoritedByMealId((prev) => ({
            ...prev,
            ...Object.fromEntries(next.map((i) => [i.mealId, i.isFavorited])),
          }));
        }
      } else {
        const result = await listMealsAction({
          collection: activeCollection === 'saved' ? 'saved' : 'all',
          q,
          mealSlot: mealSlot || undefined,
          maxTotalMinutes: Number.isFinite(maxTotalMinutes)
            ? maxTotalMinutes
            : undefined,
          sourceName,
          tagLabelsAny: tags,
          cuisineOptionId: cuisineParam || null,
          proteinTypeOptionId: proteinParam || null,
          limit: 6,
          offset: items.length,
        });
        if (result.ok && result.data.items.length > 0) {
          const next = result.data.items;
          setExtraItems((prev) => [...prev, ...next]);
          setFavoritedByMealId((prev) => ({
            ...prev,
            ...Object.fromEntries(next.map((i) => [i.mealId, i.isFavorited])),
          }));
        }
      }
    } finally {
      setLoadingMore(false);
    }
  }, [
    activeCollection,
    loadingMore,
    totalCount,
    items.length,
    q,
    mealSlot,
    maxTotalMinutes,
    sourceName,
    tags,
    cuisineParam,
    proteinParam,
  ]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || totalCount == null || items.length >= totalCount) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          !loadingMore &&
          items.length < totalCount
        ) {
          loadMore();
        }
      },
      { rootMargin: '200px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loadingMore, items.length, totalCount]);

  return (
    <div className="space-y-6">
      {/* Tabs: Alles / Opgeslagen / Recent (collection=all|saved|recent) */}
      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-700">
        <button
          type="button"
          onClick={handleTabAlles}
          className={
            activeCollection === 'all'
              ? 'border-b-2 border-primary-600 dark:border-primary-500 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400'
              : 'border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-500 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-primary-400'
          }
        >
          Alles
        </button>
        <button
          type="button"
          onClick={handleTabOpgeslagen}
          className={
            activeCollection === 'saved'
              ? 'border-b-2 border-primary-600 dark:border-primary-500 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400'
              : 'border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-500 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-primary-400'
          }
        >
          Opgeslagen
        </button>
        <button
          type="button"
          onClick={handleTabRecent}
          className={
            activeCollection === 'recent'
              ? 'border-b-2 border-primary-600 dark:border-primary-500 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400'
              : 'border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-500 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-primary-400'
          }
        >
          Recent
        </button>
      </div>

      {/* Zoekveld + filterrij (desktop: chips met dropdowns, mobile: drawer) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px] flex gap-2">
            <span className="relative flex-1 min-w-0">
              <InputGroup>
                <MagnifyingGlassIcon data-slot="icon" />
                <Input
                  type="search"
                  placeholder="Zoek op titel…"
                  aria-label="Zoek op titel"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onBlur={handleSearchSubmit}
                />
              </InputGroup>
            </span>
            <Button outline onClick={handleSearchSubmit} aria-label="Zoeken">
              Zoeken
            </Button>
          </div>
          <div className="hidden sm:flex flex-wrap items-center gap-2">
            <FilterChipDropdown
              key={`soort-${mealSlot}-${filterCloseKeys.soort}`}
              label="Soort"
              summary={
                mealSlot ? formatMealSlot(mealSlot as MealSlotValue) : 'Alle'
              }
              icon={<QueueListIcon className="h-4 w-4" />}
              panel={
                <FilterSoortPanel
                  value={mealSlot || ''}
                  onApply={(v) => pushParams({ mealSlot: v || undefined })}
                  onCancel={() => closeFilter('soort')}
                />
              }
            />
            <FilterChipDropdown
              key={`tijd-${maxTotalMinutes ?? 'all'}-${filterCloseKeys.tijd}`}
              label="Tijd"
              summary={
                maxTotalMinutes != null && Number.isFinite(maxTotalMinutes)
                  ? `≤${maxTotalMinutes} min`
                  : 'Alle'
              }
              icon={<ClockIcon className="h-4 w-4" />}
              panel={
                <FilterTijdPanel
                  value={maxTotalMinutes}
                  onApply={(v) =>
                    pushParams({ maxTotalMinutes: v ?? undefined })
                  }
                  onCancel={() => closeFilter('tijd')}
                />
              }
            />
            <FilterChipDropdown
              key={`bron-${sourceName}-${filterCloseKeys.bron}`}
              label="Bron"
              summary={sourceName || 'Alle'}
              icon={<DocumentTextIcon className="h-4 w-4" />}
              panel={
                <FilterBronPanel
                  value={sourceName}
                  onApply={(v) => pushParams({ sourceName: v || undefined })}
                  onCancel={() => closeFilter('bron')}
                />
              }
            />
            <FilterChipDropdown
              key={`tags-${tags.join(',')}-${filterCloseKeys.tags}`}
              label="Tags"
              summary={tags.length > 0 ? `(${tags.length})` : 'Geen'}
              icon={<TagIcon className="h-4 w-4" />}
              panel={
                <FilterTagsPanel
                  tags={tags}
                  onApply={(nextTags) => pushParams({ tags: nextTags })}
                  onCancel={() => closeFilter('tags')}
                />
              }
            />
            <FilterChipDropdown
              key={`cuisine-${cuisineParam}-${filterCloseKeys.cuisine}`}
              label="Keuken"
              summary={
                catalogLoadError
                  ? '—'
                  : cuisineParam
                    ? (() => {
                        const opt = cuisineOptions.find(
                          (o) => o.id === cuisineParam,
                        );
                        const label = opt?.label ?? 'Gekozen';
                        return opt && opt.isActive === false
                          ? `${label} (inactief)`
                          : label;
                      })()
                    : 'Alle keukens'
              }
              icon={<Square3Stack3DIcon className="h-4 w-4" />}
              panel={
                <FilterOptionPanel
                  options={cuisineOptions}
                  value={cuisineParam}
                  placeholder="Alle keukens"
                  disabled={!!catalogLoadError}
                  loadError={catalogLoadError}
                  onApply={(id) => pushParams({ cuisine: id || '' })}
                  onCancel={() => closeFilter('cuisine')}
                />
              }
            />
            <FilterChipDropdown
              key={`protein-${proteinParam}-${filterCloseKeys.protein}`}
              label="Proteïne"
              summary={
                catalogLoadError
                  ? '—'
                  : proteinParam
                    ? (() => {
                        const opt = proteinTypeOptions.find(
                          (o) => o.id === proteinParam,
                        );
                        const label = opt?.label ?? 'Gekozen';
                        return opt && opt.isActive === false
                          ? `${label} (inactief)`
                          : label;
                      })()
                    : 'Alle proteïnes'
              }
              icon={<Square3Stack3DIcon className="h-4 w-4" />}
              panel={
                <FilterOptionPanel
                  options={proteinTypeOptions}
                  value={proteinParam}
                  placeholder="Alle proteïnes"
                  disabled={!!catalogLoadError}
                  loadError={catalogLoadError}
                  onApply={(id) => pushParams({ protein: id || '' })}
                  onCancel={() => closeFilter('protein')}
                />
              }
            />
          </div>
          <Button
            outline
            className="sm:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <FunnelIcon className="h-5 w-5" />
            Filters
          </Button>
        </div>

        {/* Tweede rij: Labels-samenvatting + Wis filters */}
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          {tags.length > 0 && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Labels: {tags.join(', ')}
            </span>
          )}
          {hasAnyFilter && (
            <Button
              plain
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <XMarkIcon className="h-4 w-4" />
              Wis filters
            </Button>
          )}
        </div>

        {/* Actieve filters als removable chips (chip-stijl zoals referentie) */}
        {hasAnyFilter && (
          <div className="flex flex-wrap items-center gap-2">
            {q && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-zinc-100 px-2.5 py-1 text-sm text-zinc-950 dark:bg-zinc-800 dark:text-white">
                Zoek: {q}
                <button
                  type="button"
                  onClick={() => removeFilter('q')}
                  aria-label="Verwijder zoekterm"
                  className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            {mealSlot && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-zinc-100 px-2.5 py-1 text-sm text-zinc-950 dark:bg-zinc-800 dark:text-white">
                {formatMealSlot(mealSlot as MealSlotValue)}
                <button
                  type="button"
                  onClick={() => removeFilter('mealSlot')}
                  aria-label="Verwijder soort"
                  className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            {maxTotalMinutes != null && Number.isFinite(maxTotalMinutes) && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-zinc-100 px-2.5 py-1 text-sm text-zinc-950 dark:bg-zinc-800 dark:text-white">
                ≤{maxTotalMinutes} min
                <button
                  type="button"
                  onClick={() => removeFilter('maxTotalMinutes')}
                  aria-label="Verwijder tijd"
                  className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            {sourceName && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-zinc-100 px-2.5 py-1 text-sm text-zinc-950 dark:bg-zinc-800 dark:text-white">
                Bron: {sourceName}
                <button
                  type="button"
                  onClick={() => removeFilter('sourceName')}
                  aria-label="Verwijder bron"
                  className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-zinc-100 px-2.5 py-1 text-sm text-zinc-950 dark:bg-zinc-800 dark:text-white"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeFilter('tag', tag)}
                  aria-label={`Verwijder tag ${tag}`}
                  className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {cuisineParam && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-zinc-100 px-2.5 py-1 text-sm text-zinc-950 dark:bg-zinc-800 dark:text-white">
                Keuken:{' '}
                {(() => {
                  const opt = cuisineOptions.find((o) => o.id === cuisineParam);
                  const label = opt?.label ?? cuisineParam;
                  return opt && opt.isActive === false
                    ? `${label} (inactief)`
                    : label;
                })()}
                <button
                  type="button"
                  onClick={() => removeFilter('cuisine')}
                  aria-label="Verwijder keuken"
                  className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            {proteinParam && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-zinc-100 px-2.5 py-1 text-sm text-zinc-950 dark:bg-zinc-800 dark:text-white">
                Proteïne:{' '}
                {(() => {
                  const opt = proteinTypeOptions.find(
                    (o) => o.id === proteinParam,
                  );
                  const label = opt?.label ?? proteinParam;
                  return opt && opt.isActive === false
                    ? `${label} (inactief)`
                    : label;
                })()}
                <button
                  type="button"
                  onClick={() => removeFilter('protein')}
                  aria-label="Verwijder proteïne"
                  className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Mobile filters drawer */}
      <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} size="md">
        <DialogTitle>Filters</DialogTitle>
        <DialogDescription>
          Stel filters in en klik op Toepassen.
        </DialogDescription>
        <DialogBody>
          <RecipesFiltersDrawerContent
            current={{
              mealSlot: mealSlot ?? '',
              maxTotalMinutes,
              sourceName,
              tags,
              cuisineOptionId: cuisineParam ?? '',
              proteinTypeOptionId: proteinParam ?? '',
            }}
            cuisineOptions={cuisineOptions}
            proteinTypeOptions={proteinTypeOptions}
            catalogLoadError={catalogLoadError ?? ''}
            onApply={(next) => {
              pushParams(next);
              setDrawerOpen(false);
            }}
            onAddTag={(tag) => pushParams({ tags: [...tags, tag] })}
            onRemoveTag={(tag) =>
              pushParams({ tags: tags.filter((t) => t !== tag) })
            }
          />
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDrawerOpen(false)}>
            Sluiten
          </Button>
        </DialogActions>
      </Dialog>

      {/* Results */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 p-8 text-center space-y-4">
          <Text className="text-zinc-600 dark:text-zinc-400">
            Geen recepten gevonden.
          </Text>
          {hasAnyFilter && (
            <Button outline onClick={clearFilters}>
              Wis filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {totalCount != null && (
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {totalCount} recepten
            </Text>
          )}
          <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-x-8">
            {items.map((item) => (
              <MealCard
                key={item.mealId}
                item={item}
                isFavorited={favoritedByMealId[item.mealId] ?? item.isFavorited}
                isSaving={favoriteSavingByMealId[item.mealId] ?? false}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </ul>
          {totalCount != null && items.length < totalCount && (
            <div
              ref={loadMoreSentinelRef}
              className="flex justify-center py-4"
              aria-hidden
            >
              {loadingMore && (
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  Laden…
                </Text>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* Filter chip: rounded button with icon + label + summary + chevron, opens dropdown panel (referentie-stijl) */
function FilterChipDropdown({
  label,
  summary,
  icon,
  panel,
}: {
  label: string;
  summary: string;
  icon: React.ReactNode;
  panel: React.ReactNode;
}) {
  return (
    <Dropdown>
      <DropdownButton
        className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700 data-open:bg-zinc-200 dark:data-open:bg-zinc-700"
        as="button"
      >
        {icon}
        <span>
          {label} ({summary})
        </span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-70" />
      </DropdownButton>
      <DropdownMenu
        anchor="bottom start"
        variant="panel"
        className="isolate w-max min-w-[220px] max-w-[280px] rounded-xl overflow-visible bg-white dark:bg-zinc-800 shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10"
      >
        <div className="p-4 space-y-4">
          <p className="font-semibold text-zinc-950 dark:text-white">{label}</p>
          {panel}
        </div>
      </DropdownMenu>
    </Dropdown>
  );
}

function FilterSoortPanel({
  value,
  onApply,
  onCancel,
}: {
  value: string;
  onApply: (v: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(value);
  return (
    <>
      <div className="space-y-0 max-h-[200px] overflow-y-auto [scrollbar-gutter:stable]">
        <label className="flex w-full items-center gap-2 rounded-lg py-2 text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/50">
          <input
            type="radio"
            name="mealSlot"
            checked={selected === ''}
            onChange={() => setSelected('')}
            className="shrink-0 rounded-full border-zinc-300 text-zinc-900 focus:ring-zinc-500"
          />
          <span className="min-w-0">Alle</span>
        </label>
        {MEAL_SLOT_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex w-full items-center gap-2 rounded-lg py-2 text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
          >
            <input
              type="radio"
              name="mealSlot"
              checked={selected === opt.value}
              onChange={() => setSelected(opt.value)}
              className="shrink-0 rounded-full border-zinc-300 text-zinc-900 focus:ring-zinc-500"
            />
            <span className="min-w-0">{opt.label}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-600">
        <Button
          plain
          onClick={onCancel}
          className="text-blue-600 dark:text-blue-400"
        >
          Annuleren
        </Button>
        <Button
          plain
          onClick={() => onApply(selected)}
          className="text-blue-600 dark:text-blue-400"
        >
          Toepassen
        </Button>
      </div>
    </>
  );
}

function FilterTijdPanel({
  value,
  onApply,
  onCancel,
}: {
  value: number | undefined;
  onApply: (v: number | undefined) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(value ?? null);
  return (
    <>
      <div className="space-y-0 max-h-[200px] overflow-y-auto [scrollbar-gutter:stable]">
        {TIME_PRESETS.map((preset) => (
          <label
            key={preset.label}
            className="flex w-full items-center gap-2 rounded-lg py-2 text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
          >
            <input
              type="radio"
              name="tijd"
              checked={
                (preset.value === null && selected === null) ||
                (preset.value !== null && selected === preset.value)
              }
              onChange={() => setSelected(preset.value)}
              className="shrink-0 rounded-full border-zinc-300 text-zinc-900 focus:ring-zinc-500"
            />
            <span className="min-w-0">{preset.label}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-600">
        <Button
          plain
          onClick={onCancel}
          className="text-blue-600 dark:text-blue-400"
        >
          Annuleren
        </Button>
        <Button
          plain
          onClick={() => onApply(selected ?? undefined)}
          className="text-blue-600 dark:text-blue-400"
        >
          Toepassen
        </Button>
      </div>
    </>
  );
}

function FilterOptionPanel({
  options,
  value,
  placeholder,
  disabled,
  loadError,
  onApply,
  onCancel,
}: {
  options: CatalogOptionItem[];
  value: string;
  placeholder: string;
  disabled: boolean;
  loadError: string | undefined;
  onApply: (id: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(value);
  return (
    <>
      {loadError && (
        <Text className="text-sm text-red-600 dark:text-red-400 mb-2">
          Keuzes laden mislukt.
        </Text>
      )}
      <Select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.isActive !== false ? opt.label : `${opt.label} (inactief)`}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-600">
        <Button
          plain
          onClick={onCancel}
          className="text-blue-600 dark:text-blue-400"
        >
          Annuleren
        </Button>
        <Button
          plain
          onClick={() => onApply(selected)}
          className="text-blue-600 dark:text-blue-400"
        >
          Toepassen
        </Button>
      </div>
    </>
  );
}

function FilterBronPanel({
  value,
  onApply,
  onCancel,
}: {
  value: string;
  onApply: (v: string) => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState(value);
  return (
    <>
      <div className="flex gap-2">
        <InputGroup className="flex-1 min-w-0">
          <FunnelIcon className="h-4 w-4" data-slot="icon" />
          <Input
            type="text"
            placeholder="Typ om te filteren"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-900/50"
          />
        </InputGroup>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-600">
        <Button
          plain
          onClick={onCancel}
          className="text-blue-600 dark:text-blue-400"
        >
          Annuleren
        </Button>
        <Button
          plain
          onClick={() => onApply(input.trim())}
          className="text-blue-600 dark:text-blue-400"
        >
          Toepassen
        </Button>
      </div>
    </>
  );
}

function FilterTagsPanel({
  tags,
  onApply,
  onCancel,
}: {
  tags: string[];
  onApply: (nextTags: string[]) => void;
  onCancel: () => void;
}) {
  const [localTags, setLocalTags] = useState<string[]>(tags);
  const [filterInput, setFilterInput] = useState('');

  const addTag = () => {
    const t = filterInput.trim().toLowerCase();
    if (t && !localTags.includes(t)) setLocalTags([...localTags, t]);
    setFilterInput('');
  };

  return (
    <>
      <div className="flex gap-2">
        <InputGroup className="flex-1 min-w-0">
          <FunnelIcon className="h-4 w-4" data-slot="icon" />
          <Input
            type="text"
            placeholder="Typ om te filteren of tag toe te voegen"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && (e.preventDefault(), addTag())
            }
            className="bg-zinc-50 dark:bg-zinc-900/50"
          />
        </InputGroup>
      </div>
      <div className="max-h-[160px] overflow-y-auto space-y-1.5 [scrollbar-gutter:stable]">
        {localTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {localTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-700/50 px-2 py-1 text-sm text-zinc-950 dark:text-white"
              >
                {tag}
                <button
                  type="button"
                  onClick={() =>
                    setLocalTags(localTags.filter((t) => t !== tag))
                  }
                  aria-label={`Verwijder ${tag}`}
                  className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-600"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-600">
        {localTags.length > 0 && (
          <Button
            plain
            onClick={() => setLocalTags([])}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Alles deselecteren
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button
            plain
            onClick={onCancel}
            className="text-blue-600 dark:text-blue-400"
          >
            Annuleren
          </Button>
          <Button
            plain
            onClick={() => onApply(localTags)}
            className="text-blue-600 dark:text-blue-400"
          >
            Toepassen
          </Button>
        </div>
      </div>
    </>
  );
}

function MealCardThumbnail({
  imageUrl,
  alt,
  children,
}: {
  imageUrl: string | null;
  alt: string;
  children?: React.ReactNode;
}) {
  const [imageError, setImageError] = useState(false);
  const showImage = imageUrl && !imageError;

  return (
    <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-t-lg rounded-b-sm bg-zinc-100 dark:bg-zinc-800">
      {showImage ? (
        <Image
          src={imageUrl}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <PhotoIcon
            className="h-10 w-10 text-zinc-400 dark:text-zinc-500"
            aria-hidden
          />
        </div>
      )}
      {children && (
        <div className="absolute right-2 top-2 z-10">{children}</div>
      )}
    </div>
  );
}

function MealCard({
  item,
  isFavorited,
  isSaving,
  onToggleFavorite,
}: {
  item: MealListItem;
  isFavorited: boolean;
  isSaving: boolean;
  onToggleFavorite: (mealId: string) => void;
}) {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite(item.mealId);
  };
  return (
    <li className="h-[320px]">
      <Link
        href={`/recipes/${item.mealId}`}
        className="relative flex h-full flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xs hover:ring-2 hover:ring-zinc-950/10 dark:hover:ring-white/10"
      >
        <MealCardThumbnail
          imageUrl={item.imageUrl}
          alt={item.title || 'Recept'}
        >
          <Button
            type="button"
            plain
            className="rounded-full p-1.5 text-zinc-400 hover:text-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-200"
            onClick={handleFavoriteClick}
            disabled={isSaving}
            aria-label={isFavorited ? 'Verwijder uit opgeslagen' : 'Opslaan'}
            title={isFavorited ? 'Verwijder uit opgeslagen' : 'Opslaan'}
          >
            {isFavorited ? (
              <BookmarkIconSolid
                className="h-5 w-5 text-amber-400 dark:text-amber-300"
                aria-hidden
              />
            ) : (
              <BookmarkIconOutline className="h-5 w-5" aria-hidden />
            )}
          </Button>
        </MealCardThumbnail>
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <h3 className="truncate font-semibold text-zinc-950 dark:text-white pr-8">
            {item.title || 'Zonder titel'}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {item.mealSlot && (
              <Badge color="zinc" className="text-xs">
                {formatMealSlot(item.mealSlot)}
              </Badge>
            )}
            {item.totalMinutes != null && item.totalMinutes > 0 && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {item.totalMinutes} min
              </span>
            )}
            {item.servings != null && item.servings > 0 && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {item.servings} porties
              </span>
            )}
          </div>
          {item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} color="zinc" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {item.tags.length > 3 && (
                <Badge color="zinc" className="text-xs">
                  +{item.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
          {item.sourceName && (
            <p className="mt-auto pt-1 text-xs text-zinc-500 dark:text-zinc-400 truncate">
              Bron: {item.sourceName}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

type RecipesFiltersDrawerContentProps = {
  current: {
    mealSlot: string;
    maxTotalMinutes?: number;
    sourceName: string;
    tags: string[];
    cuisineOptionId: string;
    proteinTypeOptionId: string;
  };
  cuisineOptions?: CatalogOptionItem[];
  proteinTypeOptions?: CatalogOptionItem[];
  catalogLoadError?: string;
  onApply: (next: {
    mealSlot?: string;
    maxTotalMinutes?: number | null;
    sourceName?: string;
    tags?: string[];
    cuisine?: string;
    protein?: string;
  }) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
};

function RecipesFiltersDrawerContent({
  current,
  cuisineOptions = [],
  proteinTypeOptions = [],
  catalogLoadError,
  onApply,
  onAddTag,
  onRemoveTag,
}: RecipesFiltersDrawerContentProps) {
  const [mealSlot, setMealSlot] = useState(current.mealSlot || '');
  const [maxMinutes, setMaxMinutes] = useState(
    current.maxTotalMinutes != null ? String(current.maxTotalMinutes) : '',
  );
  const [sourceName, setSourceName] = useState(current.sourceName || '');
  const [cuisineOptionId, setCuisineOptionId] = useState(
    current.cuisineOptionId || '',
  );
  const [proteinTypeOptionId, setProteinTypeOptionId] = useState(
    current.proteinTypeOptionId || '',
  );
  const [tagInput, setTagInput] = useState('');
  const tags = current.tags;

  const handleApply = () => {
    onApply({
      mealSlot: mealSlot || undefined,
      maxTotalMinutes:
        maxMinutes.trim() === ''
          ? undefined
          : parseInt(maxMinutes, 10) || undefined,
      sourceName: sourceName.trim() || undefined,
      cuisine: cuisineOptionId || undefined,
      protein: proteinTypeOptionId || undefined,
    });
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) onAddTag(t);
    setTagInput('');
  };

  return (
    <div className="space-y-4">
      <Field>
        <Label>Soort</Label>
        <Select value={mealSlot} onChange={(e) => setMealSlot(e.target.value)}>
          <option value="">Alle</option>
          {MEAL_SLOT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <Label>Max. bereidingstijd (min)</Label>
        <Input
          type="number"
          min={0}
          placeholder="bijv. 30"
          value={maxMinutes}
          onChange={(e) => setMaxMinutes(e.target.value)}
        />
      </Field>
      <Field>
        <Label>Bron</Label>
        <Input
          type="text"
          placeholder="bronnaam"
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
        />
      </Field>
      <Field>
        <Label>Keuken</Label>
        <Select
          value={cuisineOptionId}
          onChange={(e) => setCuisineOptionId(e.target.value)}
          disabled={!!catalogLoadError}
        >
          <option value="">Alle keukens</option>
          {cuisineOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.isActive !== false ? opt.label : `${opt.label} (inactief)`}
            </option>
          ))}
        </Select>
        {catalogLoadError && (
          <Text className="mt-1 text-sm text-red-600 dark:text-red-400">
            Keuzes laden mislukt.
          </Text>
        )}
      </Field>
      <Field>
        <Label>Proteïne-type</Label>
        <Select
          value={proteinTypeOptionId}
          onChange={(e) => setProteinTypeOptionId(e.target.value)}
          disabled={!!catalogLoadError}
        >
          <option value="">Alle proteïnes</option>
          {proteinTypeOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.isActive !== false ? opt.label : `${opt.label} (inactief)`}
            </option>
          ))}
        </Select>
        {catalogLoadError && (
          <Text className="mt-1 text-sm text-red-600 dark:text-red-400">
            Keuzes laden mislukt.
          </Text>
        )}
      </Field>
      <Field>
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Tag + Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && (e.preventDefault(), addTag())
            }
          />
          <Button outline onClick={addTag}>
            Toevoegen
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-sm"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  aria-label={`Verwijder ${tag}`}
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Field>
      <Button color="primary" onClick={handleApply}>
        Toepassen
      </Button>
    </div>
  );
}
