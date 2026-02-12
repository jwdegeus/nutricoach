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
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
} from '@/components/catalyst/dropdown';
import { Checkbox } from '@/components/catalyst/checkbox';
import { Switch } from '@/components/catalyst/switch';
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
  StarIcon,
  Squares2X2Icon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/20/solid';
import { BookmarkIcon as BookmarkIconSolid } from '@heroicons/react/16/solid';
import { BookmarkIcon as BookmarkIconOutline } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { useToast } from '@/src/components/app/ToastContext';
import { setMealFavoritedAction } from '../actions/meal-favorites.actions';
import { listMealsAction } from '../actions/meal-list.actions';
import { listRecentMealsAction } from '../actions/meal-recent.actions';
import { bulkUpdateMealSlotAction } from '../actions/meal-bulk.actions';
import type {
  MealListItem,
  ListMealsOutput,
  MealSlotValue,
  WeekMenuStatus,
} from '../actions/meal-list.actions';

const MEAL_SLOT_OPTIONS: { value: MealSlotValue; label: string }[] = [
  { value: 'breakfast', label: 'Ontbijt' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Diner' },
  { value: 'snack', label: 'Snack' },
  { value: 'other', label: 'Overig' },
];

const BULK_SLOT_OPTIONS: {
  value: 'breakfast' | 'lunch' | 'dinner';
  label: string;
}[] = [
  { value: 'breakfast', label: 'Ontbijt' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Avondeten' },
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

function weekMenuStatusLabel(s: WeekMenuStatus): string {
  switch (s) {
    case 'ready':
      return 'Weekmenu-klaar';
    case 'blocked_slot':
      return 'Soort blokkeert weekmenu';
    case 'blocked_refs':
      return 'Ingrediëntkoppelingen ontbreken';
    case 'blocked_both':
      return 'Niet klaar';
  }
}

function weekMenuStatusTitle(s: WeekMenuStatus): string {
  switch (s) {
    case 'ready':
      return 'Dit recept is geschikt voor het weekmenu (soort ontbijt/lunch/diner en ingrediënten gekoppeld aan de database voor nutriënten).';
    case 'blocked_slot':
      return 'Soort is geen ontbijt, lunch of diner. Alleen die soorten worden gebruikt in het weekmenu.';
    case 'blocked_refs':
      return 'Er zijn geen ingrediënten gekoppeld aan de database voor nutriënten. Koppel ingrediënten (NEVO, eigen of FNDDS) om dit recept in het weekmenu te gebruiken.';
    case 'blocked_both':
      return '• Soort blokkeert weekmenu\n• Ingrediëntkoppelingen ontbreken';
  }
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
  if (
    updates.mealSlotOptionId !== undefined &&
    updates.mealSlotOptionId !== null &&
    updates.mealSlotOptionId !== ''
  ) {
    params.set('mealSlotOptionId', String(updates.mealSlotOptionId));
    params.delete('mealSlot');
  } else {
    set('mealSlot', updates.mealSlot);
    if (updates.mealSlotOptionId === null || updates.mealSlotOptionId === '')
      params.delete('mealSlotOptionId');
  }
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
  mealSlotOptions?: CatalogOptionItem[];
  catalogLoadError?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_REGEX.test(s);
}

export function RecipesIndexClient({
  listResult,
  searchParams,
  cuisineOptions = [],
  proteinTypeOptions = [],
  mealSlotOptions = [],
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

  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTargetSlot, setBulkTargetSlot] = useState<
    'breakfast' | 'lunch' | 'dinner' | null
  >(null);
  const [bulkApplyLoading, setBulkApplyLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [filterNevoMissingOnly, setFilterNevoMissingOnly] = useState(
    () => getParam(searchParams, 'filter') === 'nevo-missing',
  );
  const [filterNotWeekMenuReady, setFilterNotWeekMenuReady] = useState(
    () => getParam(searchParams, 'filter') === 'not-weekmenu-ready',
  );
  const [filterIncompleteLinks, setFilterIncompleteLinks] = useState(
    () => getParam(searchParams, 'filter') === 'incomplete-links',
  );

  const [extraItems, setExtraItems] = useState<MealListItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // Reset extra items when server result changes (e.g. filter/tab change)
  useEffect(() => {
    setExtraItems([]);
  }, [listResult]);

  // Deep link: /recipes?filter=nevo-missing|not-weekmenu-ready|incomplete-links
  useEffect(() => {
    const filter = getParam(searchParams, 'filter');
    if (filter === 'nevo-missing') setFilterNevoMissingOnly(true);
    if (filter === 'not-weekmenu-ready') setFilterNotWeekMenuReady(true);
    if (filter === 'incomplete-links') setFilterIncompleteLinks(true);
  }, [searchParams]);

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
  const mealSlotOptionIdParam = getParam(searchParams, 'mealSlotOptionId');
  const mealSlotOptionId =
    mealSlotOptionIdParam && isUuid(mealSlotOptionIdParam)
      ? mealSlotOptionIdParam
      : undefined;
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
    mealSlotOptionId != null ||
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
        mealSlot: mealSlotOptionId ? undefined : mealSlot || undefined,
        mealSlotOptionId: mealSlotOptionId ?? null,
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
      mealSlotOptionId,
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
      const clearMealSlotWhenOptionId =
        updates.mealSlotOptionId !== undefined &&
        updates.mealSlotOptionId !== null &&
        String(updates.mealSlotOptionId).trim() !== '';
      const clearMealSlotOptionIdWhenSlot = updates.mealSlot !== undefined;
      const next = buildQueryString({
        collection: (updates.collection as CollectionValue) ?? activeCollection,
        q: updates.q ?? q,
        mealSlot: clearMealSlotWhenOptionId
          ? undefined
          : (updates.mealSlot ?? mealSlot ?? undefined),
        mealSlotOptionId: clearMealSlotOptionIdWhenSlot
          ? null
          : updates.mealSlotOptionId !== undefined
            ? updates.mealSlotOptionId
            : (mealSlotOptionId ?? null),
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
      mealSlotOptionId,
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
        | 'mealSlotOptionId'
        | 'maxTotalMinutes'
        | 'sourceName'
        | 'tag'
        | 'cuisine'
        | 'protein',
      value?: string,
    ) => {
      if (key === 'q') pushParams({ q: '' });
      else if (key === 'mealSlot')
        pushParams({ mealSlot: undefined, mealSlotOptionId: null });
      else if (key === 'mealSlotOptionId')
        pushParams({ mealSlotOptionId: null, mealSlot: undefined });
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

  const filteredItems = useMemo(() => {
    let result = items;
    if (filterNevoMissingOnly) {
      result = result.filter(
        (i) =>
          i.weekMenuStatus === 'blocked_refs' ||
          i.weekMenuStatus === 'blocked_both',
      );
    }
    if (filterNotWeekMenuReady) {
      result = result.filter((i) => i.weekMenuStatus !== 'ready');
    }
    if (filterIncompleteLinks) {
      result = result.filter(
        (i) =>
          i.ingredientLinkStatus != null &&
          i.ingredientLinkStatus.total > 0 &&
          i.ingredientLinkStatus.linked < i.ingredientLinkStatus.total,
      );
    }
    return result;
  }, [
    items,
    filterNevoMissingOnly,
    filterNotWeekMenuReady,
    filterIncompleteLinks,
  ]);

  const selectableIds = useMemo(
    () =>
      new Set(
        filteredItems
          .filter(
            (i) =>
              i.weekMenuStatus === 'blocked_slot' ||
              i.weekMenuStatus === 'blocked_both' ||
              i.weekMenuStatus === 'blocked_refs',
          )
          .map((i) => i.mealId),
      ),
    [filteredItems],
  );

  const handleBulkSelectAll = useCallback(() => {
    setSelectedIds(new Set(selectableIds));
  }, [selectableIds]);

  const handleBulkApply = useCallback(async () => {
    if (selectedIds.size === 0 || bulkTargetSlot == null) return;
    setBulkError(null);
    setBulkApplyLoading(true);
    try {
      const result = await bulkUpdateMealSlotAction({
        ids: Array.from(selectedIds),
        mealSlot: bulkTargetSlot,
      });
      if (result.ok) {
        showToast({
          type: 'success',
          title: 'Soort bijgewerkt',
          description: `${result.data.updatedCount} recept(en) gezet op ${BULK_SLOT_OPTIONS.find((o) => o.value === bulkTargetSlot)?.label ?? bulkTargetSlot}.`,
        });
        setSelectedIds(new Set());
        setBulkTargetSlot(null);
        setBulkSelectMode(false);
        router.refresh();
      } else {
        setBulkError(result.error.message);
      }
    } finally {
      setBulkApplyLoading(false);
    }
  }, [selectedIds, bulkTargetSlot, showToast, router]);

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
          mealSlot: mealSlotOptionId ? undefined : mealSlot || undefined,
          mealSlotOptionId: mealSlotOptionId ?? null,
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
              ? 'border-b-2 border-primary-600 px-3 py-2 text-sm font-medium text-primary-600 dark:border-primary-500 dark:text-primary-400'
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
              ? 'border-b-2 border-primary-600 px-3 py-2 text-sm font-medium text-primary-600 dark:border-primary-500 dark:text-primary-400'
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
              ? 'border-b-2 border-primary-600 px-3 py-2 text-sm font-medium text-primary-600 dark:border-primary-500 dark:text-primary-400'
              : 'border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-500 hover:text-primary-600 dark:text-zinc-400 dark:hover:text-primary-400'
          }
        >
          Recent
        </button>
      </div>

      {/* Zoekveld + filterrij (desktop: chips met dropdowns, mobile: drawer) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[200px] flex-1 gap-2">
            <span className="relative min-w-0 flex-1">
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
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            <FilterChipDropdown
              key={`soort-${mealSlot}-${mealSlotOptionId}-${filterCloseKeys.soort}`}
              label="Soort"
              summary={
                mealSlotOptionId
                  ? (mealSlotOptions.find((o) => o.id === mealSlotOptionId)
                      ?.label ?? 'Soort')
                  : mealSlot
                    ? formatMealSlot(mealSlot as MealSlotValue)
                    : 'Alle'
              }
              icon={<QueueListIcon className="h-4 w-4" />}
              panel={
                <FilterSoortPanel
                  value={mealSlotOptionId || mealSlot || ''}
                  mealSlotOptions={mealSlotOptions}
                  onApply={(v) => {
                    if (isUuid(v)) {
                      pushParams({ mealSlotOptionId: v, mealSlot: undefined });
                    } else {
                      pushParams({
                        mealSlot: v || undefined,
                        mealSlotOptionId: null,
                      });
                    }
                  }}
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
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
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
            {(mealSlot || mealSlotOptionId) && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-zinc-100 px-2.5 py-1 text-sm text-zinc-950 dark:bg-zinc-800 dark:text-white">
                {mealSlotOptionId
                  ? (mealSlotOptions.find((o) => o.id === mealSlotOptionId)
                      ?.label ?? 'Soort')
                  : formatMealSlot(mealSlot as MealSlotValue)}
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

      {/* Bulk slot toolbar + NEVO filter */}
      {!bulkSelectMode ? (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            outline
            onClick={() => {
              setBulkSelectMode(true);
              setBulkError(null);
            }}
            title="Selecteer meerdere recepten om bulk te wijzigen (soort)"
          >
            <Squares2X2Icon className="h-4 w-4" />
            Bulk selectie
          </Button>
          <label className="flex cursor-pointer items-center gap-2">
            <Switch
              checked={filterNevoMissingOnly}
              onChange={setFilterNevoMissingOnly}
            />
            <span className="text-sm text-foreground">
              Toon alleen: NEVO ontbreekt
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Switch
              checked={filterNotWeekMenuReady}
              onChange={setFilterNotWeekMenuReady}
            />
            <span className="text-sm text-foreground">
              Toon alleen: niet weekmenu-klaar
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Switch
              checked={filterIncompleteLinks}
              onChange={setFilterIncompleteLinks}
            />
            <span className="text-sm text-foreground">
              Toon alleen: onvolledig gekoppeld
            </span>
          </label>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/20 px-4 py-3 shadow-sm">
          <Button plain onClick={() => setBulkSelectMode(false)}>
            Annuleren
          </Button>
          <Button outline onClick={handleBulkSelectAll}>
            Alles selecteren
          </Button>
          <Dropdown>
            <DropdownButton
              className="inline-flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm font-medium shadow-sm"
              as="button"
            >
              Zet soort naar:{' '}
              {bulkTargetSlot
                ? (BULK_SLOT_OPTIONS.find((o) => o.value === bulkTargetSlot)
                    ?.label ?? bulkTargetSlot)
                : '…'}
              <ChevronDownIcon className="h-4 w-4" />
            </DropdownButton>
            <DropdownMenu>
              {BULK_SLOT_OPTIONS.map((opt) => (
                <DropdownItem
                  key={opt.value}
                  onClick={() => setBulkTargetSlot(opt.value)}
                >
                  {opt.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
          <Button
            color="primary"
            disabled={
              selectedIds.size === 0 ||
              bulkTargetSlot == null ||
              bulkApplyLoading
            }
            onClick={handleBulkApply}
          >
            {bulkApplyLoading ? 'Bezig…' : 'Toepassen'}
          </Button>
          <Button
            outline
            disabled={selectedIds.size === 0 || selectedIds.size > 10}
            onClick={() => {
              const ids = Array.from(selectedIds).slice(0, 10);
              ids.forEach((id) =>
                window.open(`/recipes/${id}`, '_blank', 'noopener,noreferrer'),
              );
            }}
          >
            Open NEVO koppeling ({Math.min(selectedIds.size, 10)} tabs)
          </Button>
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} geselecteerd
          </span>
        </div>
      )}
      {bulkSelectMode && selectedIds.size > 10 && (
        <div className="rounded-xl bg-amber-500/10 px-4 py-2 text-sm text-amber-700 shadow-sm dark:text-amber-300">
          Selecteer max 10 recepten om in tabs te openen.
        </div>
      )}
      {bulkSelectMode && (
        <Text className="text-sm text-muted-foreground">
          Tip: start met recepten waarbij &quot;Soort blokkeert weekmenu&quot;.
        </Text>
      )}
      {bulkError && (
        <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 shadow-sm dark:text-red-300">
          {bulkError}
        </div>
      )}

      {/* Results */}
      {filteredItems.length === 0 ? (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <Text className="text-zinc-600 dark:text-zinc-400">
            {filterNevoMissingOnly
              ? 'Geen recepten met ontbrekende NEVO-koppelingen.'
              : filterNotWeekMenuReady
                ? 'Geen recepten die nog niet weekmenu-klaar zijn.'
                : filterIncompleteLinks
                  ? 'Geen recepten met onvolledige ingrediëntkoppelingen.'
                  : 'Geen recepten gevonden.'}
          </Text>
          {hasAnyFilter &&
            !filterNevoMissingOnly &&
            !filterNotWeekMenuReady &&
            !filterIncompleteLinks && (
              <Button outline onClick={clearFilters}>
                Wis filters
              </Button>
            )}
          {(filterNevoMissingOnly ||
            filterNotWeekMenuReady ||
            filterIncompleteLinks) && (
            <Button
              plain
              onClick={() => {
                setFilterNevoMissingOnly(false);
                setFilterNotWeekMenuReady(false);
                setFilterIncompleteLinks(false);
              }}
            >
              Toon alle recepten
            </Button>
          )}
        </div>
      ) : (
        <>
          {totalCount != null && (
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {filterNevoMissingOnly
                ? `${filteredItems.length} recepten (NEVO ontbreekt)`
                : filterNotWeekMenuReady
                  ? `${filteredItems.length} recepten (niet weekmenu-klaar)`
                  : filterIncompleteLinks
                    ? `${filteredItems.length} recepten (onvolledig gekoppeld)`
                    : `${totalCount} recepten`}
            </Text>
          )}
          <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 xl:gap-x-8">
            {filteredItems.map((item) => (
              <MealCard
                key={item.mealId}
                item={item}
                isFavorited={favoritedByMealId[item.mealId] ?? item.isFavorited}
                isSaving={favoriteSavingByMealId[item.mealId] ?? false}
                onToggleFavorite={handleToggleFavorite}
                bulkSelectMode={bulkSelectMode}
                isBulkSelectable={
                  item.weekMenuStatus === 'blocked_slot' ||
                  item.weekMenuStatus === 'blocked_both' ||
                  item.weekMenuStatus === 'blocked_refs'
                }
                isBulkSelected={selectedIds.has(item.mealId)}
                onBulkToggleSelect={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.mealId)) next.delete(item.mealId);
                    else next.add(item.mealId);
                    return next;
                  });
                }}
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
        className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 data-open:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700 dark:data-open:bg-zinc-700"
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
        className="isolate w-max max-w-[280px] min-w-[220px] overflow-visible rounded-xl bg-white shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10"
      >
        <div className="space-y-4 p-4">
          <p className="font-semibold text-zinc-950 dark:text-white">{label}</p>
          {panel}
        </div>
      </DropdownMenu>
    </Dropdown>
  );
}

function FilterSoortPanel({
  value,
  mealSlotOptions = [],
  onApply,
  onCancel,
}: {
  value: string;
  mealSlotOptions?: CatalogOptionItem[];
  onApply: (v: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(value);
  return (
    <>
      <div className="max-h-[280px] space-y-0 overflow-y-auto [scrollbar-gutter:stable]">
        <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50">
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
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
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
        {mealSlotOptions.length > 0 && (
          <>
            {mealSlotOptions.map((opt) => (
              <label
                key={opt.id}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
              >
                <input
                  type="radio"
                  name="mealSlot"
                  checked={selected === opt.id}
                  onChange={() => setSelected(opt.id)}
                  className="shrink-0 rounded-full border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                />
                <span className="min-w-0">
                  {opt.isActive === false
                    ? `${opt.label} (inactief)`
                    : opt.label}
                </span>
              </label>
            ))}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-600">
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
      <div className="max-h-[200px] space-y-0 overflow-y-auto [scrollbar-gutter:stable]">
        {TIME_PRESETS.map((preset) => (
          <label
            key={preset.label}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
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
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-600">
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
        <Text className="mb-2 text-sm text-red-600 dark:text-red-400">
          Keuzes laden mislukt.
        </Text>
      )}
      <Listbox
        value={selected}
        onChange={(val) => setSelected(val)}
        disabled={disabled}
        aria-label={placeholder}
      >
        <ListboxOption value="">{placeholder}</ListboxOption>
        {options.map((opt) => (
          <ListboxOption key={opt.id} value={opt.id}>
            {opt.isActive !== false ? opt.label : `${opt.label} (inactief)`}
          </ListboxOption>
        ))}
      </Listbox>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-600">
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
        <InputGroup className="min-w-0 flex-1">
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
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-600">
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
        <InputGroup className="min-w-0 flex-1">
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
      <div className="max-h-[160px] space-y-1.5 overflow-y-auto [scrollbar-gutter:stable]">
        {localTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {localTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-sm text-zinc-950 dark:bg-zinc-700/50 dark:text-white"
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-600">
        {localTags.length > 0 && (
          <Button
            plain
            onClick={() => setLocalTags([])}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Alles deselecteren
          </Button>
        )}
        <div className="ml-auto flex gap-2">
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
        <div className="absolute top-2 right-2 z-10">{children}</div>
      )}
    </div>
  );
}

function MealCard({
  item,
  isFavorited,
  isSaving,
  onToggleFavorite,
  bulkSelectMode = false,
  isBulkSelectable = false,
  isBulkSelected = false,
  onBulkToggleSelect,
}: {
  item: MealListItem;
  isFavorited: boolean;
  isSaving: boolean;
  onToggleFavorite: (mealId: string) => void;
  bulkSelectMode?: boolean;
  isBulkSelectable?: boolean;
  isBulkSelected?: boolean;
  onBulkToggleSelect?: () => void;
}) {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite(item.mealId);
  };
  const showNevoCta =
    item.weekMenuStatus === 'blocked_refs' ||
    item.weekMenuStatus === 'blocked_both';
  return (
    <li className="flex h-[320px] flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-900">
        <Link
          href={`/recipes/${item.mealId}`}
          className="relative flex min-h-0 flex-1 flex-col rounded-lg"
        >
          {bulkSelectMode && (
            <div
              className="absolute top-2 left-2 z-10"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              title={
                isBulkSelectable
                  ? isBulkSelected
                    ? 'Deselecteer'
                    : 'Selecteer'
                  : 'Alleen recepten met weekmenu-blokkade (soort of NEVO) zijn selecteerbaar'
              }
            >
              <Checkbox
                color="zinc"
                checked={isBulkSelected}
                disabled={!isBulkSelectable}
                onChange={() => {
                  if (isBulkSelectable && onBulkToggleSelect)
                    onBulkToggleSelect();
                }}
              />
            </div>
          )}
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
            <h3 className="truncate pr-8 font-semibold text-zinc-950 dark:text-white">
              {item.title || 'Zonder titel'}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {item.weekMenuStatus === 'ready' && (
                <span
                  title="Weekmenu-klaar"
                  className="inline-flex shrink-0 text-green-600 dark:text-green-400"
                  aria-label="Weekmenu-klaar"
                >
                  <ShieldCheckIcon className="h-4 w-4" />
                </span>
              )}
              {(item.weekMenuStatus === 'blocked_refs' ||
                item.weekMenuStatus === 'blocked_both') && (
                <span
                  title="Ingrediëntkoppelingen ontbreken"
                  className="inline-flex shrink-0 text-amber-600 dark:text-amber-400"
                  aria-label="Ingrediëntkoppelingen ontbreken"
                >
                  <WrenchScrewdriverIcon className="h-4 w-4" />
                </span>
              )}
              {item.weekMenuStatus === 'blocked_slot' && (
                <Badge
                  color="amber"
                  className="text-xs"
                  title={weekMenuStatusTitle('blocked_slot')}
                >
                  {weekMenuStatusLabel('blocked_slot')}
                </Badge>
              )}
              {item.mealSlot && (
                <Badge color="zinc" className="text-xs">
                  {formatMealSlot(item.mealSlot)}
                </Badge>
              )}
              {item.ingredientLinkStatus &&
                item.ingredientLinkStatus.total > 0 && (
                  <Badge
                    color={
                      item.ingredientLinkStatus.linked ===
                      item.ingredientLinkStatus.total
                        ? 'green'
                        : item.ingredientLinkStatus.linked > 0
                          ? 'amber'
                          : 'zinc'
                    }
                    className="text-xs"
                    title={`${item.ingredientLinkStatus.linked} van ${item.ingredientLinkStatus.total} ingrediënten gekoppeld aan product`}
                  >
                    {item.ingredientLinkStatus.linked}/
                    {item.ingredientLinkStatus.total}
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
              {item.userRating != null && item.userRating >= 1 && (
                <div
                  className="flex items-center gap-0.5"
                  title={`Beoordeling: ${item.userRating}/5`}
                >
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <StarIcon
                        key={star}
                        className={`h-3.5 w-3.5 ${
                          star <= item.userRating!
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'fill-zinc-300 text-zinc-300 dark:fill-zinc-600 dark:text-zinc-600'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {item.userRating}/5
                  </span>
                </div>
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
              <p className="mt-auto truncate pt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Bron: {item.sourceName}
              </p>
            )}
          </div>
        </Link>
        {showNevoCta && (
          <div className="shrink-0 px-4 pt-1 pb-3">
            <Link
              href={`/recipes/${item.mealId}`}
              className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Koppel ingrediënten
            </Link>
          </div>
        )}
      </div>
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
        <Listbox
          value={mealSlot}
          onChange={(val) => setMealSlot(val)}
          aria-label="Soort"
        >
          <ListboxOption value="">Alle</ListboxOption>
          {MEAL_SLOT_OPTIONS.map((opt) => (
            <ListboxOption key={opt.value} value={opt.value}>
              {opt.label}
            </ListboxOption>
          ))}
        </Listbox>
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
        <Listbox
          value={cuisineOptionId}
          onChange={(val) => setCuisineOptionId(val)}
          disabled={!!catalogLoadError}
          aria-label="Keuken"
        >
          <ListboxOption value="">Alle keukens</ListboxOption>
          {cuisineOptions.map((opt) => (
            <ListboxOption key={opt.id} value={opt.id}>
              {opt.isActive !== false ? opt.label : `${opt.label} (inactief)`}
            </ListboxOption>
          ))}
        </Listbox>
        {catalogLoadError && (
          <Text className="mt-1 text-sm text-red-600 dark:text-red-400">
            Keuzes laden mislukt.
          </Text>
        )}
      </Field>
      <Field>
        <Label>Proteïne-type</Label>
        <Listbox
          value={proteinTypeOptionId}
          onChange={(val) => setProteinTypeOptionId(val)}
          disabled={!!catalogLoadError}
          aria-label="Proteïne-type"
        >
          <ListboxOption value="">Alle proteïnes</ListboxOption>
          {proteinTypeOptions.map((opt) => (
            <ListboxOption key={opt.id} value={opt.id}>
              {opt.isActive !== false ? opt.label : `${opt.label} (inactief)`}
            </ListboxOption>
          ))}
        </Listbox>
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
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-sm dark:bg-zinc-800"
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
