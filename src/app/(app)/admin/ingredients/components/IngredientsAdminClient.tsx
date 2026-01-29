'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from '@/components/catalyst/link';
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
import { Input } from '@/components/catalyst/input';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Select } from '@/components/catalyst/select';
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
  MagnifyingGlassIcon,
  PlusIcon,
  ArrowPathIcon,
  EllipsisVerticalIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/20/solid';

type SourceType = 'nevo' | 'custom';

type ListItemNevo = {
  source: 'nevo';
  id: number;
  nevo_code: number;
  name_nl: string;
  name_en: string | null;
  food_group_nl: string;
  food_group_en: string;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  fiber_g: number | null;
  quantity: string | null;
};

type ListItemCustom = {
  source: 'custom';
  id: string;
  name_nl: string;
  name_en: string | null;
  food_group_nl: string;
  food_group_en: string;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  fiber_g: number | null;
  quantity: string | null;
  created_by: string | null;
};

type ListItem = ListItemNevo | ListItemCustom;

type ListResult = {
  items: ListItem[];
  total: number;
  page: number;
  limit: number;
};

/** Label voor weergave: NEVO, AI generated (custom met created_by), NutriCoach (custom zonder created_by) */
function getSourceLabel(row: ListItem): 'NEVO' | 'AI generated' | 'NutriCoach' {
  if (row.source === 'nevo') return 'NEVO';
  const custom = row as ListItemCustom;
  return custom.created_by ? 'AI generated' : 'NutriCoach';
}

type SourceFilter = 'nevo' | 'custom' | 'ai_generated' | 'eigen' | 'all';

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'Alles' },
  { value: 'nevo', label: 'NEVO' },
  { value: 'ai_generated', label: 'AI generated' },
  { value: 'eigen', label: 'Eigen' },
];

const PAGE_SIZE = 25;

function formatNum(value: number | null | undefined): string {
  if (value == null) return '–';
  if (Number.isNaN(value)) return '–';
  return String(value);
}

type IngredientsAdminClientProps = {
  /** Wanneer true (bij gebruik in tab), geen eigen paginatitel tonen */
  embedded?: boolean;
  /** Toon alleen NEVO-ingrediënten zonder categorie (vanaf dashboard-link) */
  initialFilterNoCategory?: boolean;
};

export function IngredientsAdminClient({
  embedded = false,
  initialFilterNoCategory = false,
}: IngredientsAdminClientProps = {}) {
  const router = useRouter();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(
    initialFilterNoCategory ? 'nevo' : 'nevo',
  );
  const [noCategoryFilter, setNoCategoryFilter] = useState(
    initialFilterNoCategory,
  );
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNoCategoryFilter(initialFilterNoCategory);
  }, [initialFilterNoCategory]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<ListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name_nl: '',
    food_group_nl: '',
    food_group_en: '',
  });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [foodGroups, setFoodGroups] = useState<{ nl: string; en: string }[]>(
    [],
  );
  const [foodGroupsLoading, setFoodGroupsLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('source', sourceFilter);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (searchDebounced) params.set('search', searchDebounced);
      if (noCategoryFilter && sourceFilter === 'nevo')
        params.set('noCategory', '1');
      const res = await fetch(`/api/admin/ingredients?${params}`);
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message ?? 'Fout bij laden');
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij laden');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, page, searchDebounced, noCategoryFilter]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    setFoodGroupsLoading(true);
    fetch('/api/admin/ingredients/food-groups')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.ok && json.data?.groups) {
          setFoodGroups(json.data.groups);
        }
      })
      .finally(() => {
        if (!cancelled) setFoodGroupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const openDetail = (item: ListItem) => {
    if (item.source === 'custom') {
      router.push(`/admin/ingredients/custom/${item.id}`);
      return;
    }
    router.push(`/admin/ingredients/nevo/${item.id}`);
  };

  const handleDeleteClick = (item: ListItem) => {
    setDeleteItem(item);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteItem) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const url =
        deleteItem.source === 'nevo'
          ? `/api/admin/ingredients/nevo/${deleteItem.id}`
          : `/api/admin/ingredients/custom/${deleteItem.id}`;
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
    const food_group_nl = createForm.food_group_nl.trim() || 'Overig';
    const food_group_en = createForm.food_group_en.trim() || 'Other';
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
      setCreateOpen(false);
      setCreateForm({ name_nl: '', food_group_nl: '', food_group_en: '' });
      if (newId) {
        router.push(`/admin/ingredients/custom/${newId}`);
      }
      setSourceFilter('eigen');
      setPage(1);
      loadList();
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : 'Eigen ingredient aanmaken mislukt',
      );
    } finally {
      setCreateSaving(false);
    }
  };

  /** Bij source=all: één gecombineerde lijst (items, total, page). Anders gesplitst. */
  const unifiedResult =
    data && 'items' in data && sourceFilter === 'all'
      ? (data as ListResult)
      : null;
  const nevoResult =
    data && 'items' in data && sourceFilter === 'nevo'
      ? (data as ListResult)
      : null;
  const customResult =
    data &&
    'items' in data &&
    (sourceFilter === 'custom' ||
      sourceFilter === 'ai_generated' ||
      sourceFilter === 'eigen')
      ? (data as ListResult)
      : null;

  const totalPages = (total: number) =>
    Math.max(1, Math.ceil(total / PAGE_SIZE));

  const renderTable = (
    items: ListItem[],
    total: number,
    currentPage: number,
    onPageChange: (p: number) => void,
  ) => (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <Table striped>
          <TableHead>
            <TableRow>
              <TableHeader className="py-3 px-4">Bron</TableHeader>
              <TableHeader className="py-3 px-4">Code</TableHeader>
              <TableHeader className="py-3 px-4">Naam (NL)</TableHeader>
              <TableHeader className="py-3 px-4">Groep</TableHeader>
              <TableHeader className="py-3 px-4 text-right">kcal</TableHeader>
              <TableHeader className="py-3 px-4 text-right">
                Eiwit (g)
              </TableHeader>
              <TableHeader className="py-3 px-4 text-right">
                Vet (g)
              </TableHeader>
              <TableHeader className="py-3 px-4 text-right">
                Koolh. (g)
              </TableHeader>
              <TableHeader className="py-3 px-4 text-right">
                Vezel (g)
              </TableHeader>
              <TableHeader className="w-12 py-3 px-2" aria-label="Acties" />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center text-zinc-500 dark:text-zinc-400 py-10 px-4"
                >
                  Geen ingrediënten gevonden
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow
                  key={`${row.source}-${row.id}`}
                  className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  onClick={() => openDetail(row)}
                >
                  <TableCell className="py-3 px-4">
                    <Badge
                      color={
                        getSourceLabel(row) === 'NEVO'
                          ? 'blue'
                          : getSourceLabel(row) === 'AI generated'
                            ? 'amber'
                            : 'zinc'
                      }
                    >
                      {getSourceLabel(row)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4 font-mono text-zinc-600 dark:text-zinc-400">
                    {row.source === 'nevo'
                      ? (row as ListItemNevo).nevo_code
                      : String((row as ListItemCustom).id).slice(0, 8)}
                  </TableCell>
                  <TableCell className="py-3 px-4 font-medium text-zinc-900 dark:text-white max-w-[200px] truncate">
                    {row.name_nl}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-zinc-600 dark:text-zinc-400 max-w-[160px] truncate">
                    {row.food_group_nl}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right tabular-nums">
                    {formatNum(row.energy_kcal)}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right tabular-nums">
                    {formatNum(row.protein_g)}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right tabular-nums">
                    {formatNum(row.fat_g)}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right tabular-nums">
                    {formatNum(row.carbs_g)}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right tabular-nums">
                    {formatNum(row.fiber_g)}
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
                      </DropdownMenu>
                    </Dropdown>
                  </TableCell>
                </TableRow>
              ))
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
              Ingrediënten (NEVO)
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Bekijk NEVO-voedingsmiddelen en voedingswaarden. Voeg eigen
              ingredienten toe als ze niet in NEVO staan.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-1" />
            Nieuw eigen ingredient
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Ingrediënten
          </h2>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-1" />
            Nieuw eigen ingredient
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Bron:
          </label>
          <select
            value={sourceFilter}
            onChange={(e) => {
              const next = e.target.value as SourceFilter;
              setSourceFilter(next);
              if (next !== 'nevo') setNoCategoryFilter(false);
              setPage(1);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            placeholder="Zoek op naam..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button plain onClick={loadList} disabled={loading}>
          <ArrowPathIcon
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
          />
          Vernieuwen
        </Button>
      </div>

      {noCategoryFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <span>Filter: alleen NEVO-ingrediënten zonder categorie.</span>
          <Link
            href="/admin/ingredients"
            onClick={(e) => {
              e.preventDefault();
              setNoCategoryFilter(false);
              router.replace('/admin/ingredients');
            }}
            className="font-medium underline hover:no-underline"
          >
            Toon alle NEVO-ingrediënten
          </Link>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-zinc-500 dark:text-zinc-400">
          Laden...
        </div>
      ) : unifiedResult ? (
        renderTable(
          unifiedResult.items,
          unifiedResult.total,
          unifiedResult.page,
          setPage,
        )
      ) : nevoResult ? (
        renderTable(
          nevoResult.items,
          nevoResult.total,
          nevoResult.page,
          setPage,
        )
      ) : customResult ? (
        renderTable(
          customResult.items,
          customResult.total,
          customResult.page,
          setPage,
        )
      ) : null}

      {/* Create custom dialog – alleen Naam en NEVO groep */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} size="lg">
        <DialogTitle>Nieuw eigen ingredient</DialogTitle>
        <DialogBody>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Voeg een ingredient toe dat niet in het NEVO-bestand staat. Vul naam
            en kies een NEVO-groep; daarna kun je op de editpagina de overige
            velden invullen.
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
              <Label>NEVO groep</Label>
              <Select
                value={createForm.food_group_nl}
                onChange={(e) => {
                  const nl = e.target.value;
                  const opt = foodGroups.find((g) => g.nl === nl);
                  setCreateForm((f) => ({
                    ...f,
                    food_group_nl: nl,
                    food_group_en: opt?.en ?? nl,
                  }));
                }}
                disabled={foodGroupsLoading}
              >
                <option value="">
                  {foodGroupsLoading ? 'Laden...' : '— Kies een groep'}
                </option>
                {foodGroups.map((g) => (
                  <option key={g.nl} value={g.nl}>
                    {g.nl}
                  </option>
                ))}
              </Select>
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
            ? `Weet je zeker dat je "${deleteItem.name_nl}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`
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
