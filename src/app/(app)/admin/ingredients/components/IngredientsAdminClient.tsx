'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/catalyst/table';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Input, InputGroup } from '@/components/catalyst/input';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Field, Label } from '@/components/catalyst/fieldset';
import {
  Listbox,
  ListboxOption,
  ListboxLabel,
} from '@/components/catalyst/listbox';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
} from '@/components/catalyst/dropdown';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import {
  Pagination,
  PaginationPrevious,
  PaginationNext,
  PaginationList,
  PaginationPage,
  PaginationGap,
} from '@/components/catalyst/pagination';
import {
  PlusIcon,
  ArrowPathIcon,
  EllipsisVerticalIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassCircleIcon,
} from '@heroicons/react/20/solid';
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
} from '@heroicons/react/16/solid';
import { Checkbox } from '@/components/catalyst/checkbox';
import { Switch, SwitchField } from '@/components/catalyst/switch';
import { loadIngredientOverviewAction } from '@/src/app/(app)/ingredients/actions/ingredient-overview.actions';
import { setIngredientEnabledAction } from '@/src/app/(app)/admin/ingredients/actions/ingredient-state.actions';
import { findIngredientDuplicatesAction } from '@/src/app/(app)/admin/ingredients/actions/ingredient-duplicates.actions';
import { bulkSetIngredientEnabledAction } from '@/src/app/(app)/admin/ingredients/actions/ingredient-state.actions';
import {
  getIngredientCategoriesAction,
  addIngredientCategoryItemAction,
} from '@/src/app/(app)/settings/actions/ingredient-categories-admin.actions';
import type { DuplicateCandidate } from '@/src/app/(app)/admin/ingredients/actions/ingredient-duplicates.actions';
import type {
  IngredientOverviewRow,
  IngredientOverviewSource,
} from '@/src/app/(app)/ingredients/ingredients.types';

/** Display label for source: NEVO, AI, NutriCoach, FNDDS */
function getSourceLabel(
  source: IngredientOverviewRow['source'],
): 'NEVO' | 'AI' | 'NutriCoach' | 'FNDDS' {
  switch (source) {
    case 'nevo':
      return 'NEVO';
    case 'ai':
      return 'AI';
    case 'custom':
      return 'NutriCoach';
    case 'fndds_survey':
      return 'FNDDS';
    default:
      return 'NutriCoach';
  }
}

const SOURCE_OPTIONS: { value: IngredientOverviewSource; label: string }[] = [
  { value: 'all', label: 'Alles' },
  { value: 'nevo', label: 'NEVO' },
  { value: 'ai', label: 'AI' },
  { value: 'custom', label: 'NutriCoach' },
  { value: 'fndds_survey', label: 'FNDDS' },
];

const PAGE_SIZE = 50;
const DUPLICATES_MODAL_LIMIT = 500;
const BULK_MAX = 500;
const MIN_SCORE_OPTIONS = [0.6, 0.7, 0.8, 0.9] as const;

type OverviewResult = {
  rows: IngredientOverviewRow[];
  totalCount: number;
};

type IngredientsAdminClientProps = {
  /** Wanneer true (bij gebruik in tab), geen eigen paginatitel tonen */
  embedded?: boolean;
  /** Toon alleen NEVO-ingrediënten (vanaf dashboard-link) */
  initialFilterNoCategory?: boolean;
};

export function IngredientsAdminClient({
  embedded = false,
  initialFilterNoCategory = false,
}: IngredientsAdminClientProps = {}) {
  const router = useRouter();
  const [sourceFilter, setSourceFilter] = useState<IngredientOverviewSource>(
    initialFilterNoCategory ? 'nevo' : 'all',
  );
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OverviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<IngredientOverviewRow | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [togglingUid, setTogglingUid] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name_nl: '',
    categoryId: '',
  });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [ingredientCategories, setIngredientCategories] = useState<
    Array<{ id: string; name_nl: string; name_en: string | null }>
  >([]);
  const [ingredientCategoriesLoading, setIngredientCategoriesLoading] =
    useState(false);

  const [duplicatesModalOpen, setDuplicatesModalOpen] = useState(false);
  const [duplicatesCandidates, setDuplicatesCandidates] = useState<
    DuplicateCandidate[]
  >([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [duplicatesError, setDuplicatesError] = useState<string | null>(null);
  const [duplicatesMinScore, setDuplicatesMinScore] = useState(0.6);
  const [duplicatesOnlyEnabled, setDuplicatesOnlyEnabled] = useState(true);
  const [duplicatesIncludeTrgm, setDuplicatesIncludeTrgm] = useState(false);
  const [duplicatesQ, setDuplicatesQ] = useState('');
  const [selectedFnddsUids, setSelectedFnddsUids] = useState<Set<string>>(
    new Set(),
  );
  const [bulkDisabling, setBulkDisabling] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(
    null,
  );
  const [duplicatesHasSearched, setDuplicatesHasSearched] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadIngredientOverviewAction({
        q: searchDebounced || undefined,
        source: sourceFilter,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      if ('error' in result) {
        setError(result.error);
        setData(null);
      } else {
        setData({
          rows: result.rows,
          totalCount: result.totalCount ?? result.rows.length,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij laden');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, page, searchDebounced]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    setIngredientCategoriesLoading(true);
    getIngredientCategoriesAction()
      .then((result) => {
        if (!cancelled && result.ok && result.data) {
          const active = result.data.filter((c) => c.is_active);
          setIngredientCategories(
            active.map((c) => ({
              id: c.id,
              name_nl: c.name_nl,
              name_en: c.name_en,
            })),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIngredientCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const openDetail = (row: IngredientOverviewRow) => {
    if (row.source === 'nevo') {
      router.push(`/admin/ingredients/nevo/${row.source_id}`);
      return;
    }
    if (row.source === 'custom' || row.source === 'ai') {
      router.push(`/admin/ingredients/custom/${row.source_id}`);
      return;
    }
    if (row.source === 'fndds_survey') {
      router.push(`/admin/ingredients/fndds/${row.source_id}`);
      return;
    }
  };

  const canEditOrDelete = (row: IngredientOverviewRow) =>
    row.source === 'nevo' ||
    row.source === 'custom' ||
    row.source === 'ai' ||
    row.source === 'fndds_survey';

  const handleToggleEnabled = useCallback(
    async (row: IngredientOverviewRow) => {
      const uid = row.ingredient_uid;
      const nextEnabled = !(row.is_enabled ?? true);
      setTogglingUid(uid);
      setToggleError(null);
      const result = await setIngredientEnabledAction({
        ingredientUid: uid,
        isEnabled: nextEnabled,
        reason: nextEnabled ? undefined : 'disabled_by_admin',
      });
      setTogglingUid(null);
      if (result.ok) {
        loadList();
      } else {
        setToggleError(result.error);
      }
    },
    [loadList],
  );

  const searchDuplicates = useCallback(async () => {
    setDuplicatesLoading(true);
    setDuplicatesError(null);
    const result = await findIngredientDuplicatesAction({
      q: duplicatesQ.trim() || undefined,
      limit: DUPLICATES_MODAL_LIMIT,
      minScore: duplicatesMinScore,
      includeDisabled: !duplicatesOnlyEnabled,
      includeTrgm: duplicatesIncludeTrgm,
    });
    setDuplicatesLoading(false);
    setDuplicatesHasSearched(true);
    if (result.ok) {
      setDuplicatesCandidates(result.rows);
      const preselect = new Set(
        result.rows
          .filter(
            (c) =>
              (c.matchMethod === 'exact' || c.matchMethod === 'contains') &&
              c.isFnddsEnabled,
          )
          .map((c) => c.recommendedDisableUid),
      );
      setSelectedFnddsUids(preselect);
    } else {
      setDuplicatesError(result.error);
      setDuplicatesCandidates([]);
    }
  }, [
    duplicatesQ,
    duplicatesMinScore,
    duplicatesOnlyEnabled,
    duplicatesIncludeTrgm,
  ]);

  const selectAllDuplicates = useCallback(() => {
    const toSelect = duplicatesCandidates
      .filter((c) => c.isFnddsEnabled)
      .map((c) => c.recommendedDisableUid);
    setSelectedFnddsUids(new Set(toSelect));
  }, [duplicatesCandidates]);

  const selectNoneDuplicates = useCallback(() => {
    setSelectedFnddsUids(new Set());
  }, []);

  const toggleDuplicateSelection = useCallback((fnddsUid: string) => {
    setSelectedFnddsUids((prev) => {
      const next = new Set(prev);
      if (next.has(fnddsUid)) next.delete(fnddsUid);
      else next.add(fnddsUid);
      return next;
    });
  }, []);

  const bulkDisableSelected = useCallback(async () => {
    const uids = Array.from(selectedFnddsUids);
    if (uids.length === 0 || uids.length > BULK_MAX) return;
    setBulkDisabling(true);
    setBulkError(null);
    const result = await bulkSetIngredientEnabledAction({
      ingredientUids: uids,
      isEnabled: false,
      reason: 'duplicate_of_nevo',
    });
    setBulkDisabling(false);
    if (result.ok) {
      setBulkSuccessMessage(
        `${result.updated} FNDDS-ingrediënt(en) uitgeschakeld.`,
      );
      setDuplicatesModalOpen(false);
      loadList();
      setTimeout(() => setBulkSuccessMessage(null), 5000);
    } else {
      setBulkError(result.error);
    }
  }, [selectedFnddsUids, loadList]);

  const handleDeleteClick = (item: IngredientOverviewRow) => {
    setDeleteItem(item);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteItem || !canEditOrDelete(deleteItem)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const url =
        deleteItem.source === 'nevo'
          ? `/api/admin/ingredients/nevo/${deleteItem.source_id}`
          : deleteItem.source === 'fndds_survey'
            ? `/api/admin/ingredients/fndds/${deleteItem.source_id}`
            : `/api/admin/ingredients/custom/${deleteItem.source_id}`;
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message ?? 'Verwijderen mislukt');
      }
      setDeleteOpen(false);
      setDeleteItem(null);
      loadList();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Verwijderen mislukt',
      );
    } finally {
      setDeleting(false);
    }
  }, [deleteItem, loadList]);

  const createCustom = async () => {
    const name_nl = createForm.name_nl.trim();
    if (!name_nl) {
      setCreateError('Naam is verplicht');
      return;
    }
    const category = ingredientCategories.find(
      (c) => c.id === createForm.categoryId,
    );
    if (!category) {
      setCreateError('Kies een ingredientgroep');
      return;
    }
    const food_group_nl = category.name_nl;
    const food_group_en = category.name_en ?? category.name_nl;
    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/admin/ingredients/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_nl,
          food_group_nl,
          food_group_en,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message ?? 'Aanmaken mislukt');
      }
      const newId = json.data?.id;
      const categoryIdToAdd = createForm.categoryId;
      setCreateOpen(false);
      setCreateForm({ name_nl: '', categoryId: '' });

      // Voeg het nieuwe ingrediënt ook toe aan de gekozen ingredientgroep (Ingrediënten in deze groep)
      if (categoryIdToAdd) {
        const addResult = await addIngredientCategoryItemAction({
          categoryId: categoryIdToAdd,
          term: name_nl.toLowerCase().replace(/\s+/g, ' '),
          termNl: name_nl,
          synonyms: [],
        });
        if (!addResult.ok && addResult.error?.code !== 'VALIDATION_ERROR') {
          // Duplicate term in groep is ok; andere fouten alleen loggen
          console.warn(
            'Ingredient aan groep toevoegen:',
            addResult.error?.message,
          );
        }
      }

      if (newId) {
        router.push(`/admin/ingredients/custom/${newId}`);
      }
      setSourceFilter('custom');
      setPage(1);
      loadList();
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : 'NutriCoach ingredient aanmaken mislukt',
      );
    } finally {
      setCreateSaving(false);
    }
  };

  const totalPages = (total: number) =>
    Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = () => {
    setSearch('');
    setSearchDebounced('');
    setSourceFilter('all');
    setPage(1);
    // useEffect will reload when sourceFilter/page/searchDebounced update
  };

  const renderTable = (
    items: IngredientOverviewRow[],
    total: number,
    currentPage: number,
    onPageChange: (p: number) => void,
  ) => (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table
          className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]"
          striped
        >
          <TableHead>
            <TableRow>
              <TableHeader className="py-3 px-4">Bron</TableHeader>
              <TableHeader className="py-3 px-4">Groep</TableHeader>
              <TableHeader className="py-3 px-4">Naam</TableHeader>
              <TableHeader className="py-3 px-4">Beschrijving</TableHeader>
              <TableHeader className="py-3 px-4">Aangemaakt</TableHeader>
              <TableHeader className="w-12 py-3 px-2" aria-label="Acties" />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-zinc-500 dark:text-zinc-400 py-10 px-4"
                >
                  Geen ingrediënten gevonden
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => {
                const hasDetail = canEditOrDelete(row);
                const isEnabled = row.is_enabled ?? true;
                const isToggling = togglingUid === row.ingredient_uid;
                return (
                  <TableRow
                    key={row.ingredient_uid}
                    className={
                      hasDetail
                        ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        : undefined
                    }
                    onClick={() => hasDetail && openDetail(row)}
                  >
                    <TableCell
                      className={`py-3 px-4 ${!isEnabled ? 'opacity-60' : ''}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          color={
                            row.source === 'nevo'
                              ? 'blue'
                              : row.source === 'ai'
                                ? 'amber'
                                : row.source === 'fndds_survey'
                                  ? 'green'
                                  : 'zinc'
                          }
                        >
                          {getSourceLabel(row.source)}
                        </Badge>
                        {!isEnabled && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            Uitgeschakeld
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className={`py-3 px-4 text-zinc-600 dark:text-zinc-400 max-w-[140px] truncate ${!isEnabled ? 'opacity-60' : ''}`}
                    >
                      {row.food_group_nl ?? '–'}
                    </TableCell>
                    <TableCell
                      className={`py-3 px-4 font-medium text-zinc-900 dark:text-white max-w-[200px] truncate ${!isEnabled ? 'opacity-60' : ''}`}
                    >
                      {row.display_name}
                    </TableCell>
                    <TableCell
                      className={`py-3 px-4 text-zinc-600 dark:text-zinc-400 max-w-[240px] truncate ${!isEnabled ? 'opacity-60' : ''}`}
                    >
                      {row.description ?? '–'}
                    </TableCell>
                    <TableCell
                      className={`py-3 px-4 text-zinc-500 dark:text-zinc-400 text-sm tabular-nums ${!isEnabled ? 'opacity-60' : ''}`}
                    >
                      {row.created_at
                        ? new Date(row.created_at).toLocaleDateString('nl-NL')
                        : '–'}
                    </TableCell>
                    <TableCell
                      className="py-3 px-2 w-12"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Dropdown>
                        <DropdownButton
                          as={Button}
                          plain
                          className="rounded-lg p-2"
                          aria-label="Acties"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <EllipsisVerticalIcon className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          {isEnabled ? (
                            <DropdownItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleEnabled(row);
                              }}
                              disabled={isToggling}
                              className="data-[disabled]:opacity-60"
                            >
                              {isToggling ? (
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                              ) : (
                                <XCircleIcon className="h-4 w-4" />
                              )}
                              Uitschakelen
                            </DropdownItem>
                          ) : (
                            <DropdownItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleEnabled(row);
                              }}
                              disabled={isToggling}
                              className="data-[disabled]:opacity-60"
                            >
                              {isToggling ? (
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircleIcon className="h-4 w-4" />
                              )}
                              Inschakelen
                            </DropdownItem>
                          )}
                          {hasDetail && (
                            <>
                              <DropdownItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDetail(row);
                                }}
                              >
                                <PencilSquareIcon className="h-4 w-4" />
                                Bewerken
                              </DropdownItem>
                              <DropdownItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClick(row);
                                }}
                                className="text-red-600 dark:text-red-400 data-focus:bg-red-50 data-focus:text-red-700 dark:data-focus:bg-red-900/20 dark:data-focus:text-red-300"
                              >
                                <TrashIcon className="h-4 w-4" />
                                Verwijderen
                              </DropdownItem>
                            </>
                          )}
                        </DropdownMenu>
                      </Dropdown>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {total > PAGE_SIZE && (
        <Pagination aria-label="Paginatie ingrediënten" className="mt-2">
          <PaginationPrevious
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            Vorige
          </PaginationPrevious>
          <PaginationList>
            {currentPage > 1 && (
              <PaginationPage onClick={() => onPageChange(1)}>1</PaginationPage>
            )}
            {currentPage > 2 && <PaginationGap />}
            <PaginationPage current>{currentPage}</PaginationPage>
            {currentPage < totalPages(total) - 1 && <PaginationGap />}
            {totalPages(total) > 1 && currentPage < totalPages(total) && (
              <PaginationPage onClick={() => onPageChange(totalPages(total))}>
                {totalPages(total)}
              </PaginationPage>
            )}
          </PaginationList>
          <PaginationNext
            disabled={currentPage >= totalPages(total)}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Volgende
          </PaginationNext>
        </Pagination>
      )}
    </div>
  );

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 p-6'}>
      {!embedded && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
              Ingrediënten (NEVO)
            </h1>
            <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Bekijk NEVO-voedingsmiddelen en voedingswaarden. Voeg NutriCoach-
              ingredienten toe als ze niet in NEVO staan.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-1" />
            Nieuw NutriCoach ingredient
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Ingrediënten
          </h2>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-1" />
            Nieuw NutriCoach ingredient
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          <p className="font-medium">Fout bij laden</p>
          <p className="mt-1 text-sm">{error}</p>
          <Button
            outline
            className="mt-3"
            onClick={() => {
              setError(null);
              loadList();
            }}
          >
            Opnieuw proberen
          </Button>
        </div>
      )}

      {toggleError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          <p className="font-medium">Fout bij in- of uitschakelen</p>
          <p className="mt-1 text-sm">{toggleError}</p>
          <Button outline className="mt-3" onClick={() => setToggleError(null)}>
            Sluiten
          </Button>
        </div>
      )}

      {bulkSuccessMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300">
          <p className="font-medium">{bulkSuccessMessage}</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Dropdown>
          <DropdownButton outline className="min-w-[140px] justify-between">
            {SOURCE_OPTIONS.find((o) => o.value === sourceFilter)?.label ??
              'Bron'}
            <ChevronDownIcon />
          </DropdownButton>
          <DropdownMenu>
            {SOURCE_OPTIONS.map((opt) => (
              <DropdownItem
                key={opt.value}
                onClick={() => {
                  setSourceFilter(opt.value);
                  setPage(1);
                }}
              >
                {opt.label}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
        <div className="min-w-[200px] flex-1 max-w-sm">
          <InputGroup>
            <MagnifyingGlassIcon data-slot="icon" />
            <Input
              name="search"
              type="search"
              placeholder="Zoek op naam…"
              aria-label="Zoeken"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        </div>
        <Button
          plain
          onClick={loadList}
          disabled={loading}
          className="shrink-0"
        >
          <ArrowPathIcon
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
          />
          Vernieuwen
        </Button>
        <Button
          outline
          onClick={() => {
            setDuplicatesModalOpen(true);
            setDuplicatesError(null);
            setBulkError(null);
            setDuplicatesHasSearched(false);
          }}
          className="shrink-0"
        >
          <MagnifyingGlassCircleIcon className="h-4 w-4 mr-1" />
          Vind duplicaten
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse"
              />
            ))}
          </div>
        </div>
      ) : data && data.rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            Geen resultaten. Pas filters aan of zoek op een andere term.
          </p>
          <Button outline className="mt-4" onClick={resetFilters}>
            Filters resetten
          </Button>
        </div>
      ) : data ? (
        renderTable(data.rows, data.totalCount, page, setPage)
      ) : null}

      {/* Create custom dialog – Naam en NutriCoach ingredientgroep */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} size="lg">
        <DialogTitle>Nieuw NutriCoach ingredient</DialogTitle>
        <DialogBody>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Voeg een NutriCoach-ingrediënt toe dat niet in NEVO staat. Vul naam
            en kies een ingredientgroep; daarna kun je op de editpagina de
            overige velden invullen. Het ingrediënt wordt ook in die groep
            getoond onder &quot;Ingrediënten in deze groep&quot;.
          </p>
          {createError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {createError}
            </div>
          )}
          <div className="space-y-4">
            <Field>
              <Label>Naam *</Label>
              <Input
                value={createForm.name_nl}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name_nl: e.target.value }))
                }
                placeholder="bijv. Zout"
              />
            </Field>
            <Field>
              <Label>Ingredientgroep *</Label>
              <Listbox
                value={createForm.categoryId ?? ''}
                onChange={(id) =>
                  setCreateForm((f) => ({ ...f, categoryId: id ?? '' }))
                }
                disabled={ingredientCategoriesLoading}
                placeholder={
                  ingredientCategoriesLoading
                    ? 'Laden...'
                    : '— Kies een ingredientgroep'
                }
                aria-label="Kies een ingredientgroep"
              >
                <ListboxOption value="">
                  <ListboxLabel>— Kies een ingredientgroep</ListboxLabel>
                </ListboxOption>
                {ingredientCategories.map((c) => (
                  <ListboxOption key={c.id} value={c.id}>
                    <ListboxLabel>{c.name_nl}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setCreateOpen(false)}>
            Annuleren
          </Button>
          <Button onClick={createCustom} disabled={createSaving}>
            {createSaving ? 'Aanmaken...' : 'Aanmaken'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Vind duplicaten modal */}
      <Dialog
        open={duplicatesModalOpen}
        onClose={() => setDuplicatesModalOpen(false)}
        size="5xl"
      >
        <DialogTitle>Vind duplicaten (NEVO ↔ FNDDS)</DialogTitle>
        <DialogBody>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Zoek kandidaten die waarschijnlijk hetzelfde ingrediënt zijn.
            Selecteer FNDDS-varianten om in bulk uit te schakelen (NEVO blijft
            primair).
          </p>

          <div className="flex flex-wrap items-end gap-4 mb-4">
            <Field>
              <Label>Min. score (fuzzy)</Label>
              <select
                value={duplicatesMinScore}
                onChange={(e) =>
                  setDuplicatesMinScore(
                    Number(e.target.value) as 0.6 | 0.7 | 0.8 | 0.9,
                  )
                }
                className="mt-1 block w-full rounded-lg border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white sm:text-sm"
                aria-label="Minimale score"
              >
                {MIN_SCORE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <SwitchField className="flex flex-row items-center gap-3">
              <Label>Alleen ingeschakelde FNDDS</Label>
              <Switch
                checked={duplicatesOnlyEnabled}
                onChange={setDuplicatesOnlyEnabled}
                aria-label="Alleen ingeschakelde FNDDS"
              />
            </SwitchField>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={duplicatesIncludeTrgm}
                onChange={setDuplicatesIncludeTrgm}
                aria-label="Inclusief fuzzy (trigram)"
              />
              <Label className="!mb-0">Inclusief fuzzy (trigram)</Label>
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 self-center">
              Kan traag zijn bij veel ingrediënten
            </span>
            <Field className="min-w-[180px]">
              <Label>Filter (optioneel)</Label>
              <Input
                value={duplicatesQ}
                onChange={(e) => setDuplicatesQ(e.target.value)}
                placeholder="Zoek in namen…"
                aria-label="Filter kandidaten"
              />
            </Field>
            <Button onClick={searchDuplicates} disabled={duplicatesLoading}>
              {duplicatesLoading ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <MagnifyingGlassIcon className="h-4 w-4 mr-1" />
              )}
              Zoeken
            </Button>
          </div>

          {duplicatesError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {duplicatesError}
            </div>
          )}

          {bulkError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {bulkError}
            </div>
          )}

          {duplicatesCandidates.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <Checkbox
                  checked={
                    duplicatesCandidates.filter((c) => c.isFnddsEnabled)
                      .length > 0 &&
                    duplicatesCandidates
                      .filter((c) => c.isFnddsEnabled)
                      .every((c) =>
                        selectedFnddsUids.has(c.recommendedDisableUid),
                      )
                  }
                  indeterminate={
                    selectedFnddsUids.size > 0 &&
                    !duplicatesCandidates
                      .filter((c) => c.isFnddsEnabled)
                      .every((c) =>
                        selectedFnddsUids.has(c.recommendedDisableUid),
                      )
                  }
                  onChange={selectAllDuplicates}
                  aria-label="Selecteer alles"
                />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Selecteer alles
                </span>
                <Button
                  plain
                  onClick={selectNoneDuplicates}
                  className="text-sm"
                >
                  Selecteer geen
                </Button>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Geselecteerd: {selectedFnddsUids.size}
                </span>
              </div>

              <div className="overflow-x-auto max-h-[320px] overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg">
                <Table className="[--gutter:--spacing(4)]" striped>
                  <TableHead>
                    <TableRow>
                      <TableHeader className="w-10 py-2 px-2">
                        Select
                      </TableHeader>
                      <TableHeader className="py-2 px-2">NEVO</TableHeader>
                      <TableHeader className="py-2 px-2">FNDDS</TableHeader>
                      <TableHeader className="py-2 px-2 w-24">
                        Score / Method
                      </TableHeader>
                      <TableHeader className="py-2 px-2 w-24">
                        Status FNDDS
                      </TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {duplicatesCandidates.map((c) => (
                      <TableRow key={`${c.nevoUid}-${c.fnddsUid}`}>
                        <TableCell className="py-2 px-2">
                          {c.isFnddsEnabled ? (
                            <Checkbox
                              checked={selectedFnddsUids.has(
                                c.recommendedDisableUid,
                              )}
                              onChange={() =>
                                toggleDuplicateSelection(
                                  c.recommendedDisableUid,
                                )
                              }
                              aria-label={`${c.fnddsName} selecteren`}
                            />
                          ) : (
                            <span className="text-zinc-400 text-xs">–</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="font-medium text-zinc-900 dark:text-white truncate max-w-[200px]">
                            {c.nevoName}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">
                            {c.nevoUid}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="font-medium text-zinc-900 dark:text-white truncate max-w-[200px]">
                            {c.fnddsName}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">
                            {c.fnddsUid}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <Badge
                            color={
                              c.matchMethod === 'exact'
                                ? 'green'
                                : c.matchMethod === 'contains'
                                  ? 'blue'
                                  : 'zinc'
                            }
                          >
                            {c.matchMethod}
                          </Badge>
                          <span className="ml-1 text-sm tabular-nums">
                            {c.score.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 px-2 text-sm">
                          {c.isFnddsEnabled ? (
                            <span className="text-green-600 dark:text-green-400">
                              Ingeschakeld
                            </span>
                          ) : (
                            <span className="text-zinc-500">Uitgeschakeld</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <Button
                  onClick={bulkDisableSelected}
                  disabled={
                    bulkDisabling ||
                    selectedFnddsUids.size === 0 ||
                    selectedFnddsUids.size > BULK_MAX
                  }
                >
                  {bulkDisabling ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin mr-1" />
                  ) : null}
                  Uitschakelen geselecteerde
                </Button>
                {selectedFnddsUids.size > BULK_MAX && (
                  <span className="text-sm text-amber-600 dark:text-amber-400">
                    Selectie max {BULK_MAX}
                  </span>
                )}
              </div>
            </>
          )}

          {!duplicatesLoading && duplicatesCandidates.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">
              {duplicatesHasSearched
                ? 'Geen duplicaatkandidaten gevonden.'
                : 'Klik op Zoeken om NEVO ↔ FNDDS duplicaatkandidaten te laden.'}
            </p>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDuplicatesModalOpen(false)}>
            Sluiten
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteItem(null);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Ingrediënt verwijderen"
        description={
          deleteItem
            ? `Weet je zeker dat je "${deleteItem.display_name}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`
            : 'Weet je zeker dat je dit ingrediënt wilt verwijderen?'
        }
        confirmLabel="Verwijderen"
        confirmColor="red"
        isLoading={deleting}
        error={deleteError}
      />
    </div>
  );
}
