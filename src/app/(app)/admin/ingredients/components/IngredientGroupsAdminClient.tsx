'use client';

import { useState, useEffect } from 'react';
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
import { Input } from '@/components/catalyst/input';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogDescription,
} from '@/components/catalyst/dialog';
import { Field, Label } from '@/components/catalyst/fieldset';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ArrowPathIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/20/solid';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from '@/components/catalyst/dropdown';
import {
  getIngredientCategoriesAction,
  getNevoFoodGroupsAction,
  createIngredientCategoryAction,
  deleteIngredientCategoryAction,
} from '@/src/app/(app)/settings/actions/ingredient-categories-admin.actions';

type NevoFoodGroup = { food_group_nl: string; food_group_en: string };

type Category = {
  id: string;
  code: string;
  name_nl: string;
  name_en: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
  items_count?: number;
  nevo_food_groups_nl?: string[];
  nevo_food_groups_en?: string[];
};

export function IngredientGroupsAdminClient() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [nevoGroups, setNevoGroups] = useState<NevoFoodGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name_nl: '',
    name_en: '',
    nevo_food_groups_nl: [] as string[],
  });
  const [createSaving, setCreateSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(
    null,
  );
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    const [categoriesResult, nevoResult] = await Promise.all([
      getIngredientCategoriesAction(),
      getNevoFoodGroupsAction(),
    ]);
    if (categoriesResult.ok) {
      setCategories(categoriesResult.data);
    } else {
      setError(categoriesResult.error.message);
      setCategories([]);
    }
    if (nevoResult.ok) {
      setNevoGroups(nevoResult.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleCreate = async () => {
    if (!createForm.name_nl.trim()) {
      setError('Naam (NL) is verplicht');
      return;
    }
    setCreateSaving(true);
    setError(null);
    const groupsNl = createForm.nevo_food_groups_nl ?? [];
    const groupsEn = groupsNl.map(
      (nl) =>
        nevoGroups.find((g) => g.food_group_nl === nl)?.food_group_en ?? '',
    );
    const code = createForm.name_nl
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    const result = await createIngredientCategoryAction({
      code: code || 'category',
      name_nl: createForm.name_nl.trim(),
      name_en: createForm.name_en.trim() || null,
      category_type: 'forbidden',
      nevo_food_groups_nl: groupsNl,
      nevo_food_groups_en: groupsEn,
    });
    setCreateSaving(false);
    if (result.ok) {
      setCreateOpen(false);
      setCreateForm({
        name_nl: '',
        name_en: '',
        nevo_food_groups_nl: [],
      });
      loadCategories();
    } else {
      setError(result.error.message);
    }
  };

  const openDelete = (cat: Category) => {
    setDeletingCategory(cat);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    setDeleteSaving(true);
    setDeleteError(null);
    const result = await deleteIngredientCategoryAction(deletingCategory.id);
    setDeleteSaving(false);
    if (result.ok) {
      setDeleteOpen(false);
      setDeletingCategory(null);
      loadCategories();
    } else {
      setDeleteError(result.error?.message ?? 'Verwijderen mislukt');
    }
  };

  const closeDeleteDialog = () => {
    setDeleteOpen(false);
    setDeletingCategory(null);
    setDeleteError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Ingredientgroepen
          </h2>
          <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Categorieën voor dieetregels (verboden/vereist). Koppel groepen aan
            diëten via Instellingen → Dieettype bewerken → Ingredientgroepen.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon className="mr-1 h-4 w-4" />
          Nieuwe groep
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 whitespace-pre-line text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button plain onClick={loadCategories} disabled={loading}>
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
      ) : (
        <div className="overflow-x-auto">
          <Table
            className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]"
            striped
          >
            <TableHead>
              <TableRow>
                <TableHeader>Naam (NL)</TableHeader>
                <TableHeader>NEVO groepen</TableHeader>
                <TableHeader className="text-right">Items</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="text-right">Acties</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    Geen ingredientgroepen gevonden
                  </TableCell>
                </TableRow>
              ) : (
                categories.map((cat) => (
                  <TableRow
                    key={cat.id}
                    onClick={() =>
                      router.push(`/admin/ingredients/groups/${cat.id}`)
                    }
                    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <TableCell className="font-medium text-zinc-900 dark:text-white">
                      {cat.name_nl}
                    </TableCell>
                    <TableCell className="text-zinc-600 dark:text-zinc-400">
                      {(cat.nevo_food_groups_nl?.length ?? 0) > 0
                        ? cat.nevo_food_groups_nl!.join(', ')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {cat.items_count ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge color={cat.is_active ? 'zinc' : 'amber'}>
                        {cat.is_active ? 'Actief' : 'Inactief'}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="w-0 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end">
                        <Dropdown>
                          <DropdownButton plain>
                            <EllipsisVerticalIcon className="h-5 w-5 text-zinc-500" />
                            <span className="sr-only">Acties</span>
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownSection>
                              <DropdownItem
                                onClick={() =>
                                  router.push(
                                    `/admin/ingredients/groups/${cat.id}`,
                                  )
                                }
                              >
                                <PencilIcon data-slot="icon" />
                                <span>Bewerken</span>
                              </DropdownItem>
                              <DropdownItem
                                onClick={() => openDelete(cat)}
                                className="text-red-600 data-focus:bg-red-600 data-focus:text-white dark:text-red-400"
                              >
                                <TrashIcon data-slot="icon" />
                                <span>Verwijderen</span>
                              </DropdownItem>
                            </DropdownSection>
                          </DropdownMenu>
                        </Dropdown>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} size="lg">
        <DialogTitle>Nieuwe ingredientgroep</DialogTitle>
        <DialogDescription>
          Voeg een ingredientgroep toe voor dieetregels. De code wordt
          automatisch uit de naam afgeleid.
        </DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Naam (NL) *</Label>
              <Input
                value={createForm.name_nl}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name_nl: e.target.value }))
                }
                placeholder="bijv. Glutenhoudende granen"
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
              <Label>NEVO groepen</Label>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-800">
                <div className="space-y-1.5">
                  {nevoGroups.map((g) => (
                    <label
                      key={g.food_group_nl}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                    >
                      <input
                        type="checkbox"
                        checked={createForm.nevo_food_groups_nl.includes(
                          g.food_group_nl,
                        )}
                        onChange={() => {
                          setCreateForm((f) => ({
                            ...f,
                            nevo_food_groups_nl: f.nevo_food_groups_nl.includes(
                              g.food_group_nl,
                            )
                              ? f.nevo_food_groups_nl.filter(
                                  (x) => x !== g.food_group_nl,
                                )
                              : [...f.nevo_food_groups_nl, g.food_group_nl],
                          }));
                        }}
                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                      />
                      <span className="text-sm text-zinc-900 dark:text-white">
                        {g.food_group_nl}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Koppel deze groep aan één of meer NEVO ingrediëntgroepen; later
                kun je ingrediënten uit die groepen toevoegen.
              </p>
            </Field>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setCreateOpen(false)}>
            Annuleren
          </Button>
          <Button onClick={handleCreate} disabled={createSaving}>
            {createSaving ? 'Aanmaken...' : 'Aanmaken'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={closeDeleteDialog}
        onConfirm={handleDelete}
        title="Groep verwijderen"
        description={`Weet je zeker dat je de groep "${deletingCategory?.name_nl ?? ''}" wilt verwijderen? De groep wordt inactief gezet. Als de groep nog aan een dieetregel gekoppeld is, mislukt deze actie.`}
        error={deleteError}
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        isLoading={deleteSaving}
      />
    </div>
  );
}
