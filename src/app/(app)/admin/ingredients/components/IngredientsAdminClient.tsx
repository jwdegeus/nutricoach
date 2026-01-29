'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
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
import {
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
} from '@/components/catalyst/description-list';
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
};

type ListItem = ListItemNevo | ListItemCustom;

type ListResult = {
  items: ListItem[];
  total: number;
  page: number;
  limit: number;
};

type AllResult = {
  nevo: ListResult;
  custom: ListResult;
};

type DetailFood = Record<string, unknown> & { source: SourceType };

const SOURCE_OPTIONS: { value: 'nevo' | 'custom' | 'all'; label: string }[] = [
  { value: 'all', label: 'Alles' },
  { value: 'nevo', label: 'NEVO' },
  { value: 'custom', label: 'Eigen' },
];

const PAGE_SIZE = 25;

function formatNum(value: number | null | undefined): string {
  if (value == null) return '–';
  if (Number.isNaN(value)) return '–';
  return String(value);
}

export function IngredientsAdminClient() {
  const [sourceFilter, setSourceFilter] = useState<'nevo' | 'custom' | 'all'>(
    'nevo',
  );
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [pageCustom, setPageCustom] = useState(1);
  const [data, setData] = useState<ListResult | AllResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<DetailFood | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name_nl: '',
    name_en: '',
    food_group_nl: 'Overig',
    food_group_en: 'Other',
    energy_kcal: '',
    protein_g: '',
    fat_g: '',
    carbs_g: '',
    fiber_g: '',
  });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
      if (sourceFilter === 'all') params.set('pageCustom', String(pageCustom));
      params.set('limit', String(PAGE_SIZE));
      if (searchDebounced) params.set('search', searchDebounced);
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
  }, [sourceFilter, page, pageCustom, searchDebounced]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openDetail = async (item: ListItem) => {
    setDetailOpen(true);
    setDetailItem(null);
    setDetailLoading(true);
    try {
      const url =
        item.source === 'nevo'
          ? `/api/admin/ingredients/nevo/${item.id}`
          : `/api/admin/ingredients/custom/${item.id}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? 'Niet gevonden');
      setDetailItem(json.data);
    } catch (err) {
      setDetailItem(null);
      setError(err instanceof Error ? err.message : 'Detail laden mislukt');
    } finally {
      setDetailLoading(false);
    }
  };

  const createCustom = async () => {
    const name_nl = createForm.name_nl.trim();
    if (!name_nl) {
      setCreateError('Naam (NL) is verplicht');
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        name_nl,
        name_en: createForm.name_en.trim() || null,
        food_group_nl: createForm.food_group_nl || 'Overig',
        food_group_en: createForm.food_group_en || 'Other',
      };
      if (createForm.energy_kcal !== '')
        body.energy_kcal = parseFloat(createForm.energy_kcal);
      if (createForm.protein_g !== '')
        body.protein_g = parseFloat(createForm.protein_g);
      if (createForm.fat_g !== '') body.fat_g = parseFloat(createForm.fat_g);
      if (createForm.carbs_g !== '')
        body.carbs_g = parseFloat(createForm.carbs_g);
      if (createForm.fiber_g !== '')
        body.fiber_g = parseFloat(createForm.fiber_g);

      const res = await fetch('/api/admin/ingredients/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message ?? 'Aanmaken mislukt');
      }
      setCreateOpen(false);
      setCreateForm({
        name_nl: '',
        name_en: '',
        food_group_nl: 'Overig',
        food_group_en: 'Other',
        energy_kcal: '',
        protein_g: '',
        fat_g: '',
        carbs_g: '',
        fiber_g: '',
      });
      setSourceFilter('custom');
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

  const nevoResult =
    data && 'items' in data
      ? (data as ListResult)
      : data && 'nevo' in data
        ? (data as AllResult).nevo
        : null;
  const customResult =
    data && 'custom' in data
      ? (data as AllResult).custom
      : data && sourceFilter === 'custom' && 'items' in data
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
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <Table striped>
          <TableHead>
            <TableRow>
              <TableHeader>Bron</TableHeader>
              <TableHeader>Code</TableHeader>
              <TableHeader>Naam (NL)</TableHeader>
              <TableHeader>Groep</TableHeader>
              <TableHeader className="text-right">kcal</TableHeader>
              <TableHeader className="text-right">Eiwit (g)</TableHeader>
              <TableHeader className="text-right">Vet (g)</TableHeader>
              <TableHeader className="text-right">Koolh. (g)</TableHeader>
              <TableHeader className="text-right">Vezel (g)</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-zinc-500 dark:text-zinc-400 py-8"
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
                  <TableCell>
                    <Badge color={row.source === 'nevo' ? 'blue' : 'zinc'}>
                      {row.source === 'nevo' ? 'NEVO' : 'Eigen'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-zinc-600 dark:text-zinc-400">
                    {row.source === 'nevo'
                      ? (row as ListItemNevo).nevo_code
                      : String((row as ListItemCustom).id).slice(0, 8)}
                  </TableCell>
                  <TableCell className="font-medium text-zinc-900 dark:text-white">
                    {row.name_nl}
                  </TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400">
                    {row.food_group_nl}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(row.energy_kcal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(row.protein_g)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(row.fat_g)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(row.carbs_g)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(row.fiber_g)}
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
    <div className="space-y-6 p-6">
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
              setSourceFilter(e.target.value as 'nevo' | 'custom' | 'all');
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

      {loading ? (
        <div className="py-8 text-center text-zinc-500 dark:text-zinc-400">
          Laden...
        </div>
      ) : sourceFilter === 'all' && data && 'nevo' in data ? (
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
              NEVO ({(data as AllResult).nevo.total})
            </h2>
            {renderTable(
              (data as AllResult).nevo.items,
              (data as AllResult).nevo.total,
              (data as AllResult).nevo.page,
              setPage,
            )}
          </section>
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
              Eigen ({(data as AllResult).custom.total})
            </h2>
            {renderTable(
              (data as AllResult).custom.items,
              (data as AllResult).custom.total,
              (data as AllResult).custom.page,
              setPageCustom,
            )}
          </section>
        </div>
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

      {/* Detail dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} size="4xl">
        <DialogTitle>
          {detailItem
            ? String(detailItem.name_nl ?? detailItem.name_en ?? 'Ingrediënt')
            : 'Detail'}
        </DialogTitle>
        <DialogBody>
          {detailLoading ? (
            <div className="py-8 text-center text-zinc-500">Laden...</div>
          ) : detailItem ? (
            <IngredientDetailView item={detailItem} />
          ) : (
            <p className="text-zinc-500">Geen gegevens.</p>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDetailOpen(false)}>
            Sluiten
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create custom dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} size="lg">
        <DialogTitle>Nieuw eigen ingredient</DialogTitle>
        <DialogBody>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Voeg een ingredient toe dat niet in het NEVO-bestand staat. Vul
            minimaal de Nederlandse naam in; voedingswaarden zijn optioneel (per
            100 g).
          </p>
          {createError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {createError}
            </div>
          )}
          <div className="space-y-4">
            <Field>
              <Label>Naam (NL) *</Label>
              <Input
                value={createForm.name_nl}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name_nl: e.target.value }))
                }
                placeholder="bijv. Zelfgemaakte hummus"
              />
            </Field>
            <Field>
              <Label>Naam (EN)</Label>
              <Input
                value={createForm.name_en}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name_en: e.target.value }))
                }
                placeholder="optional"
              />
            </Field>
            <Field>
              <Label>Voedingsmiddelgroep (NL)</Label>
              <Input
                value={createForm.food_group_nl}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    food_group_nl: e.target.value,
                  }))
                }
                placeholder="bijv. Samengestelde gerechten"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Label>Energie (kcal/100g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={createForm.energy_kcal}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      energy_kcal: e.target.value,
                    }))
                  }
                  placeholder="–"
                />
              </Field>
              <Field>
                <Label>Eiwit (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={createForm.protein_g}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, protein_g: e.target.value }))
                  }
                  placeholder="–"
                />
              </Field>
              <Field>
                <Label>Vet (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={createForm.fat_g}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, fat_g: e.target.value }))
                  }
                  placeholder="–"
                />
              </Field>
              <Field>
                <Label>Koolhydraten (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={createForm.carbs_g}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, carbs_g: e.target.value }))
                  }
                  placeholder="–"
                />
              </Field>
              <Field>
                <Label>Vezel (g)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={createForm.fiber_g}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, fiber_g: e.target.value }))
                  }
                  placeholder="–"
                />
              </Field>
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setCreateOpen(false)}>
            Annuleren
          </Button>
          <Button onClick={createCustom} disabled={createSaving}>
            {createSaving ? 'Opslaan...' : 'Aanmaken'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

function IngredientDetailView({ item }: { item: DetailFood }) {
  const skipKeys = new Set([
    'id',
    'created_at',
    'updated_at',
    'source',
    'nevo_code',
    'nevo_version',
  ]);

  const groups: { title: string; keys: string[] }[] = [
    {
      title: 'Algemeen',
      keys: [
        'name_nl',
        'name_en',
        'synonym',
        'food_group_nl',
        'food_group_en',
        'quantity',
        'note',
        'contains_traces_of',
        'is_fortified_with',
      ],
    },
    {
      title: 'Energie en macronutriënten',
      keys: [
        'energy_kj',
        'energy_kcal',
        'water_g',
        'protein_g',
        'fat_g',
        'carbs_g',
        'sugar_g',
        'fiber_g',
        'starch_g',
        'alcohol_g',
      ],
    },
    {
      title: 'Vetten',
      keys: [
        'saturated_fat_g',
        'monounsaturated_fat_g',
        'polyunsaturated_fat_g',
        'omega3_fat_g',
        'omega6_fat_g',
        'trans_fat_g',
        'cholesterol_mg',
      ],
    },
    {
      title: 'Mineralen',
      keys: [
        'sodium_mg',
        'potassium_mg',
        'calcium_mg',
        'phosphorus_mg',
        'magnesium_mg',
        'iron_mg',
        'zinc_mg',
        'copper_mg',
        'selenium_ug',
        'iodine_ug',
      ],
    },
    {
      title: 'Vitamines',
      keys: [
        'vit_a_rae_ug',
        'vit_d_ug',
        'vit_e_mg',
        'vit_k_ug',
        'vit_b1_mg',
        'vit_b2_mg',
        'vit_b6_mg',
        'vit_b12_ug',
        'niacin_equiv_mg',
        'folate_equiv_ug',
        'vit_c_mg',
      ],
    },
  ];

  const labelMap: Record<string, string> = {
    name_nl: 'Naam (NL)',
    name_en: 'Naam (EN)',
    synonym: 'Synoniem',
    food_group_nl: 'Groep (NL)',
    food_group_en: 'Groep (EN)',
    quantity: 'Hoeveelheid',
    note: 'Opmerking',
    contains_traces_of: 'Bevat sporen van',
    is_fortified_with: 'Verrijkt met',
    energy_kj: 'Energie (kJ)',
    energy_kcal: 'Energie (kcal)',
    water_g: 'Water (g)',
    protein_g: 'Eiwit (g)',
    fat_g: 'Vet (g)',
    carbs_g: 'Koolhydraten (g)',
    sugar_g: 'Suiker (g)',
    fiber_g: 'Vezel (g)',
    starch_g: 'Zetmeel (g)',
    alcohol_g: 'Alcohol (g)',
    saturated_fat_g: 'Verzadigd vet (g)',
    monounsaturated_fat_g: 'Enkelv. onverz. vet (g)',
    polyunsaturated_fat_g: 'Meerv. onverz. vet (g)',
    omega3_fat_g: 'Omega-3 (g)',
    omega6_fat_g: 'Omega-6 (g)',
    trans_fat_g: 'Transvet (g)',
    cholesterol_mg: 'Cholesterol (mg)',
    sodium_mg: 'Natrium (mg)',
    potassium_mg: 'Kalium (mg)',
    calcium_mg: 'Calcium (mg)',
    phosphorus_mg: 'Fosfor (mg)',
    magnesium_mg: 'Magnesium (mg)',
    iron_mg: 'IJzer (mg)',
    zinc_mg: 'Zink (mg)',
    copper_mg: 'Koper (mg)',
    selenium_ug: 'Selenium (µg)',
    iodine_ug: 'Jodium (µg)',
    vit_a_rae_ug: 'Vit. A RAE (µg)',
    vit_d_ug: 'Vit. D (µg)',
    vit_e_mg: 'Vit. E (mg)',
    vit_k_ug: 'Vit. K (µg)',
    vit_b1_mg: 'Vit. B1 (mg)',
    vit_b2_mg: 'Vit. B2 (mg)',
    vit_b6_mg: 'Vit. B6 (mg)',
    vit_b12_ug: 'Vit. B12 (µg)',
    niacin_equiv_mg: 'Niacine equiv. (mg)',
    folate_equiv_ug: 'Folaat equiv. (µg)',
    vit_c_mg: 'Vit. C (mg)',
  };

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto">
      {groups.map((group) => {
        const entries = group.keys
          .filter((k) => k in item && !skipKeys.has(k))
          .map((k) => {
            const v = item[k];
            const display =
              v == null
                ? '–'
                : typeof v === 'number'
                  ? Number.isNaN(v)
                    ? '–'
                    : String(v)
                  : String(v);
            return { key: k, label: labelMap[k] ?? k, value: display };
          })
          .filter((e) => e.value !== '–' || e.key.includes('name'));
        if (entries.length === 0) return null;
        return (
          <div key={group.title}>
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              {group.title}
            </h3>
            <DescriptionList>
              {entries.map(({ key, label, value }) => (
                <Fragment key={key}>
                  <DescriptionTerm>{label}</DescriptionTerm>
                  <DescriptionDetails>{value}</DescriptionDetails>
                </Fragment>
              ))}
            </DescriptionList>
          </div>
        );
      })}
    </div>
  );
}
