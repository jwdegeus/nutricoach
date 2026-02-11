'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';
import { Badge } from '@/components/catalyst/badge';
import { Text } from '@/components/catalyst/text';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
} from '@/components/catalyst/dropdown';
import {
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/20/solid';
import { Checkbox } from '@/components/catalyst/checkbox';
import { IngredientGroupDetailModal } from './IngredientGroupDetailModal';
import {
  listIngredientCategoriesForDietAction,
  readIngredientCategoryItemsAction,
  createIngredientCategoryAction,
  deleteIngredientCategoryAction,
} from '../actions/ingredient-categories-admin.actions';
import { getDietGroupPoliciesAction } from '../actions/guardrails.actions';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';

type IngredientGroupsTabProps = {
  dietTypeId: string;
  dietTypeName: string;
};

type Category = {
  id: string;
  code: string;
  name_nl: string;
  category_type: 'forbidden' | 'required';
  is_diet_specific: boolean;
  items_count: number;
};

type CategoryItem = {
  id: string;
  term: string;
  term_nl: string | null;
  synonyms: string[];
  display_order: number;
  is_active: boolean;
  subgroup_id: string | null;
};

export function IngredientGroupsTab({
  dietTypeId,
  dietTypeName,
}: IngredientGroupsTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Detail modal state
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null,
  );
  const [categoryItems, setCategoryItems] = useState<CategoryItem[]>([]);
  const [itemsTotalCount, setItemsTotalCount] = useState(0);
  const [itemsHasMore, setItemsHasMore] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Create category state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createCategoryData, setCreateCategoryData] = useState({
    code: '',
    name_nl: '',
    name_en: '',
    description: '',
    category_type: 'forbidden' as 'forbidden' | 'required',
    display_order: 0,
  });
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(
    null,
  );

  // Delete category state
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // Multi-select en bulk delete
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [inUseCategoryIds, setInUseCategoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    loadCategories();
  }, [dietTypeId]);

  useEffect(() => {
    getDietGroupPoliciesAction(dietTypeId).then((result) => {
      if (!('error' in result) && result.data) {
        setInUseCategoryIds(new Set(result.data.map((p) => p.categoryId)));
      }
    });
  }, [dietTypeId]);

  // Deep link support: open modal if categoryId is in URL
  useEffect(() => {
    const categoryId = searchParams.get('categoryId');
    if (categoryId && categories.length > 0 && !showDetailModal) {
      const category = categories.find((cat) => cat.id === categoryId);
      if (category) {
        setSelectedCategory(category);
        setShowDetailModal(true);
        loadCategoryItems(categoryId);
      }
    }
  }, [searchParams, categories, showDetailModal]);

  // Keep selectedCategory in sync when categories refresh (e.g. after name/slug save in modal)
  useEffect(() => {
    if (!selectedCategory?.id || categories.length === 0) return;
    const updated = categories.find((c) => c.id === selectedCategory.id);
    if (updated) setSelectedCategory(updated);
  }, [categories, selectedCategory?.id]);

  function loadCategories() {
    setIsLoading(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await listIngredientCategoriesForDietAction(dietTypeId);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        if (result.data) {
          setCategories(result.data);
        }
      } catch (_err) {
        setError('Onverwachte fout bij laden categorieën');
      } finally {
        setIsLoading(false);
      }
    });
  }

  async function loadCategoryItems(categoryId: string, keepExisting = false) {
    setIsLoadingItems(true);
    // Don't clear items if keepExisting is true (for live updates)
    if (!keepExisting) {
      setCategoryItems([]);
    }

    try {
      const result = await readIngredientCategoryItemsAction(
        categoryId,
        1_000_000,
      );
      if (result.ok && result.data) {
        setCategoryItems(result.data.items);
        setItemsTotalCount(result.data.total_count);
        setItemsHasMore(result.data.has_more);
      } else {
        setError(
          !result.ok && result.error
            ? result.error.message
            : 'Fout bij laden items',
        );
      }
    } catch (_err) {
      setError('Onverwachte fout bij laden items');
    } finally {
      setIsLoadingItems(false);
    }
  }

  async function handleCategoryClick(category: Category) {
    setSelectedCategory(category);
    setShowDetailModal(true);
    await loadCategoryItems(category.id);
  }

  function handleItemsChanged() {
    if (selectedCategory) {
      // Keep existing items during reload to prevent modal flicker
      loadCategoryItems(selectedCategory.id, true);
      // Also refresh categories list to update counts (but don't block)
      loadCategories();
    }
  }

  function handleCloseModal() {
    setShowDetailModal(false);
    setSelectedCategory(null);
    setCategoryItems([]);
    setItemsTotalCount(0);
    setItemsHasMore(false);

    // Remove categoryId from URL query params when closing modal
    const categoryId = searchParams.get('categoryId');
    if (categoryId) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('categoryId');
      const newUrl = params.toString()
        ? `/settings/diets/${dietTypeId}/edit?tab=ingredient-groups&${params.toString()}`
        : `/settings/diets/${dietTypeId}/edit?tab=ingredient-groups`;
      router.replace(newUrl);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    setDeleteCategoryId(categoryId);
    setShowDeleteDialog(true);
  }

  async function handleConfirmDelete() {
    if (!deleteCategoryId) return;

    startTransition(async () => {
      try {
        const result = await deleteIngredientCategoryAction(deleteCategoryId);

        if (!result.ok) {
          setError(result.error.message);
          setShowDeleteDialog(false);
          setDeleteCategoryId(null);
          return;
        }

        setShowDeleteDialog(false);
        setDeleteCategoryId(null);
        setSelectedCategoryIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteCategoryId);
          return next;
        });
        loadCategories();
        getDietGroupPoliciesAction(dietTypeId).then((r) => {
          if (!('error' in r) && r.data)
            setInUseCategoryIds(new Set(r.data.map((p) => p.categoryId)));
        });

        if (selectedCategory?.id === deleteCategoryId) {
          handleCloseModal();
        }
      } catch (_err) {
        setError('Onverwachte fout bij verwijderen');
        setShowDeleteDialog(false);
        setDeleteCategoryId(null);
      }
    });
  }

  function toggleCategorySelection(categoryId: string) {
    if (inUseCategoryIds.has(categoryId)) return;
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function toggleAllCategoriesSelection() {
    const canSelect = categories.filter((c) => !inUseCategoryIds.has(c.id));
    if (selectedCategoryIds.size === canSelect.length) {
      setSelectedCategoryIds(new Set());
    } else {
      setSelectedCategoryIds(new Set(canSelect.map((c) => c.id)));
    }
  }

  async function handleBulkDeleteConfirm() {
    setBulkDeleteError(null);
    setIsBulkDeleting(true);
    const ids = [...selectedCategoryIds];
    const deleted: string[] = [];
    const failed: { id: string; name: string }[] = [];
    for (const id of ids) {
      const result = await deleteIngredientCategoryAction(id);
      const cat = categories.find((c) => c.id === id);
      const name = cat?.name_nl ?? id;
      if (result.ok) {
        deleted.push(id);
      } else {
        failed.push({ id, name });
      }
    }
    setIsBulkDeleting(false);
    setShowBulkDeleteDialog(false);
    setSelectedCategoryIds(new Set());
    loadCategories();
    getDietGroupPoliciesAction(dietTypeId).then((r) => {
      if (!('error' in r) && r.data)
        setInUseCategoryIds(new Set(r.data.map((p) => p.categoryId)));
    });
    if (failed.length > 0) {
      setBulkDeleteError(
        `${deleted.length} verwijderd. ${failed.length} konden niet worden verwijderd (nog in gebruik door dieetregel): ${failed.map((f) => f.name).join(', ')}`,
      );
    }
  }

  async function handleCreateCategory() {
    if (!createCategoryData.code.trim() || !createCategoryData.name_nl.trim()) {
      setCreateCategoryError('Code en Nederlandse naam zijn verplicht');
      return;
    }

    setCreateCategoryError(null);
    startTransition(async () => {
      try {
        const result = await createIngredientCategoryAction({
          code: createCategoryData.code.trim(),
          name_nl: createCategoryData.name_nl.trim(),
          name_en: createCategoryData.name_en.trim() || null,
          description: createCategoryData.description.trim() || null,
          category_type: createCategoryData.category_type,
          display_order: createCategoryData.display_order,
        });

        if (!result.ok) {
          setCreateCategoryError(result.error.message);
          return;
        }

        setShowCreateDialog(false);
        setCreateCategoryData({
          code: '',
          name_nl: '',
          name_en: '',
          description: '',
          category_type: 'forbidden',
          display_order: 0,
        });
        loadCategories();
      } catch (_err) {
        setCreateCategoryError('Onverwachte fout bij aanmaken');
      }
    });
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
            />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
        <Text className="font-semibold">Fout bij laden ingrediëntgroepen</Text>
        <Text className="mt-1">{error}</Text>
        <Button onClick={loadCategories} color="red" className="mt-4">
          Opnieuw proberen
        </Button>
      </div>
    );
  }

  // Empty state
  if (categories.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Text className="text-zinc-500 dark:text-zinc-400">
          Geen ingrediëntgroepen gevonden voor dit dieet.
        </Text>
      </div>
    );
  }

  // Group categories
  const dietSpecificCategories = categories.filter(
    (cat) => cat.is_diet_specific,
  );
  const generalCategories = categories.filter((cat) => !cat.is_diet_specific);

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <div className="rounded-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Text className="text-sm text-zinc-600 dark:text-zinc-400">
          Overzicht van ingrediëntgroepen (ingredient_categories) die gebruikt
          worden voor dit dieet. Klik op een categorie om de items te bekijken.
        </Text>
      </div>

      {/* Categories Table */}
      <div className="rounded-lg bg-white shadow-xs dark:bg-zinc-900">
        <div className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Categorieën ({categories.length}) – Klik op een rij om items te
              bekijken. Groepen met een dieetregel kunnen pas na het verwijderen
              van die regel worden verwijderd.
            </Text>
            <div className="flex items-center gap-2">
              {selectedCategoryIds.size > 0 && (
                <Button
                  color="red"
                  onClick={() => {
                    setBulkDeleteError(null);
                    setShowBulkDeleteDialog(true);
                  }}
                >
                  <TrashIcon className="h-4 w-4" />
                  Verwijder geselecteerde ({selectedCategoryIds.size})
                </Button>
              )}
              <Button
                onClick={() => {
                  setShowCreateDialog(true);
                  setCreateCategoryError(null);
                  setCreateCategoryData({
                    code: '',
                    name_nl: '',
                    name_en: '',
                    description: '',
                    category_type: 'forbidden',
                    display_order: 0,
                  });
                }}
              >
                <PlusIcon className="h-4 w-4" />
                Nieuwe groep
              </Button>
            </div>
          </div>
          {bulkDeleteError && (
            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              {bulkDeleteError}
            </div>
          )}
          <div className="overflow-x-auto">
            <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
              <TableHead>
                <TableRow>
                  <TableHeader className="w-10" title="Selecteer">
                    <Checkbox
                      checked={
                        categories.filter((c) => !inUseCategoryIds.has(c.id))
                          .length > 0 &&
                        selectedCategoryIds.size ===
                          categories.filter((c) => !inUseCategoryIds.has(c.id))
                            .length
                      }
                      indeterminate={
                        selectedCategoryIds.size > 0 &&
                        selectedCategoryIds.size <
                          categories.filter((c) => !inUseCategoryIds.has(c.id))
                            .length
                      }
                      onChange={toggleAllCategoriesSelection}
                      aria-label="Alles selecteren (alleen groepen zonder dieetregel)"
                    />
                  </TableHeader>
                  <TableHeader>Groepsnaam</TableHeader>
                  <TableHeader>Slug</TableHeader>
                  <TableHeader>Herkomst</TableHeader>
                  <TableHeader>Items</TableHeader>
                  <TableHeader className="w-12"></TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Diet-specific categories first */}
                {dietSpecificCategories.map((category) => {
                  const inUse = inUseCategoryIds.has(category.id);
                  return (
                    <TableRow
                      key={category.id}
                      className={clsx(
                        'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
                        inUse && 'opacity-75',
                      )}
                      onClick={() => handleCategoryClick(category)}
                    >
                      <TableCell
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedCategoryIds.has(category.id)}
                          onChange={() => toggleCategorySelection(category.id)}
                          disabled={inUse}
                          aria-label={`${category.name_nl} selecteren`}
                        />
                      </TableCell>
                      <TableCell>
                        <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                          {category.name_nl}
                        </Text>
                        {inUse && (
                          <Text className="mt-0.5 block text-xs text-amber-600 dark:text-amber-400">
                            In gebruik door dieetregel – verwijder eerst die
                            regel
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {category.code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge color="blue">{dietTypeName} (dit dieet)</Badge>
                      </TableCell>
                      <TableCell>
                        <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                          {category.items_count}
                        </Text>
                      </TableCell>
                      <TableCell
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Dropdown>
                          <DropdownButton
                            plain
                            className="p-1"
                            onClick={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          >
                            <EllipsisVerticalIcon className="size-5 text-zinc-500" />
                            <span className="sr-only">Acties</span>
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                handleCategoryClick(category);
                              }}
                            >
                              <PencilIcon data-slot="icon" />
                              <span>Bewerken</span>
                            </DropdownItem>
                            <DropdownItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (!inUse) handleDeleteCategory(category.id);
                              }}
                              disabled={inUse}
                              title={
                                inUse
                                  ? 'Verwijder eerst de dieetregel (tab Dieetregels)'
                                  : undefined
                              }
                            >
                              <TrashIcon data-slot="icon" />
                              <span>
                                {inUse
                                  ? 'Verwijderen (in gebruik)'
                                  : 'Verwijderen'}
                              </span>
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* General categories */}
                {generalCategories.map((category) => {
                  const inUse = inUseCategoryIds.has(category.id);
                  return (
                    <TableRow
                      key={category.id}
                      className={clsx(
                        'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
                        inUse && 'opacity-75',
                      )}
                      onClick={() => handleCategoryClick(category)}
                    >
                      <TableCell
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedCategoryIds.has(category.id)}
                          onChange={() => toggleCategorySelection(category.id)}
                          disabled={inUse}
                          aria-label={`${category.name_nl} selecteren`}
                        />
                      </TableCell>
                      <TableCell>
                        <Text className="text-sm font-medium text-zinc-900 dark:text-white">
                          {category.name_nl}
                        </Text>
                        {inUse && (
                          <Text className="mt-0.5 block text-xs text-amber-600 dark:text-amber-400">
                            In gebruik door dieetregel – verwijder eerst die
                            regel
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {category.code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge color="zinc">Algemeen</Badge>
                      </TableCell>
                      <TableCell>
                        <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                          {category.items_count}
                        </Text>
                      </TableCell>
                      <TableCell
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Dropdown>
                          <DropdownButton
                            plain
                            className="p-1"
                            onClick={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          >
                            <EllipsisVerticalIcon className="size-5 text-zinc-500" />
                            <span className="sr-only">Acties</span>
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                handleCategoryClick(category);
                              }}
                            >
                              <PencilIcon data-slot="icon" />
                              <span>Bewerken</span>
                            </DropdownItem>
                            <DropdownItem
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (!inUse) handleDeleteCategory(category.id);
                              }}
                              disabled={inUse}
                              title={
                                inUse
                                  ? 'Verwijder eerst de dieetregel (tab Dieetregels)'
                                  : undefined
                              }
                            >
                              <TrashIcon data-slot="icon" />
                              <span>
                                {inUse
                                  ? 'Verwijderen (in gebruik)'
                                  : 'Verwijderen'}
                              </span>
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Create Category Dialog */}
      <Dialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      >
        <DialogTitle>Nieuwe ingrediëntgroep aanmaken</DialogTitle>
        <DialogBody>
          <DialogDescription>
            Maak een nieuwe ingrediëntgroep aan. Deze kan gebruikt worden voor
            guard rails regels.
          </DialogDescription>

          <FieldGroup className="mt-4">
            <Field>
              <Label htmlFor="create-code">Code *</Label>
              <Input
                id="create-code"
                value={createCategoryData.code}
                onChange={(e) =>
                  setCreateCategoryData({
                    ...createCategoryData,
                    code: e.target.value,
                  })
                }
                placeholder="bijv. dairy, gluten_containing_grains"
                disabled={isPending}
              />
              <Description>
                Unieke code voor deze groep (bijv. &quot;dairy&quot;,
                &quot;gluten_containing_grains&quot;)
              </Description>
            </Field>

            <Field>
              <Label htmlFor="create-name-nl">Nederlandse naam *</Label>
              <Input
                id="create-name-nl"
                value={createCategoryData.name_nl}
                onChange={(e) =>
                  setCreateCategoryData({
                    ...createCategoryData,
                    name_nl: e.target.value,
                  })
                }
                placeholder="bijv. Zuivel, Glutenhoudende granen"
                disabled={isPending}
              />
            </Field>

            <Field>
              <Label htmlFor="create-name-en">Engelse naam (optioneel)</Label>
              <Input
                id="create-name-en"
                value={createCategoryData.name_en}
                onChange={(e) =>
                  setCreateCategoryData({
                    ...createCategoryData,
                    name_en: e.target.value,
                  })
                }
                placeholder="bijv. Dairy, Gluten-containing grains"
                disabled={isPending}
              />
            </Field>

            <Field>
              <Label htmlFor="create-description">
                Beschrijving (optioneel)
              </Label>
              <Input
                id="create-description"
                value={createCategoryData.description}
                onChange={(e) =>
                  setCreateCategoryData({
                    ...createCategoryData,
                    description: e.target.value,
                  })
                }
                placeholder="Beschrijving van deze groep"
                disabled={isPending}
              />
            </Field>

            <Field>
              <Label htmlFor="create-display-order">Weergave volgorde</Label>
              <Input
                id="create-display-order"
                type="number"
                value={createCategoryData.display_order}
                onChange={(e) =>
                  setCreateCategoryData({
                    ...createCategoryData,
                    display_order: parseInt(e.target.value) || 0,
                  })
                }
                disabled={isPending}
              />
              <Description>Lager nummer = eerder in de lijst</Description>
            </Field>
          </FieldGroup>

          {createCategoryError && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {createCategoryError}
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button
            onClick={() => setShowCreateDialog(false)}
            color="zinc"
            disabled={isPending}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleCreateCategory}
            disabled={
              isPending ||
              !createCategoryData.code.trim() ||
              !createCategoryData.name_nl.trim()
            }
          >
            {isPending ? 'Aanmaken...' : 'Aanmaken'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
      >
        <DialogTitle>Groep verwijderen</DialogTitle>
        <DialogBody>
          <DialogDescription>
            Weet je zeker dat je deze ingrediëntgroep wilt verwijderen? Deze
            actie kan niet ongedaan worden gemaakt. Alle items in deze groep
            worden ook verwijderd.
          </DialogDescription>
        </DialogBody>
        <DialogActions>
          <Button
            onClick={() => setShowDeleteDialog(false)}
            color="zinc"
            disabled={isPending}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="red"
            disabled={isPending}
          >
            {isPending ? 'Verwijderen...' : 'Verwijderen'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={showBulkDeleteDialog}
        onClose={() => !isBulkDeleting && setShowBulkDeleteDialog(false)}
      >
        <DialogTitle>Geselecteerde ingrediëntgroepen verwijderen</DialogTitle>
        <DialogBody>
          <DialogDescription>
            Weet je zeker dat je {selectedCategoryIds.size} ingrediëntgroep
            {selectedCategoryIds.size === 1 ? '' : 'pen'} wilt verwijderen? Deze
            actie kan niet ongedaan worden gemaakt. Groepen die nog aan een
            dieetregel gekoppeld zijn, worden overgeslagen.
          </DialogDescription>
        </DialogBody>
        <DialogActions>
          <Button
            onClick={() => setShowBulkDeleteDialog(false)}
            color="zinc"
            disabled={isBulkDeleting}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleBulkDeleteConfirm}
            color="red"
            disabled={isBulkDeleting}
          >
            {isBulkDeleting ? 'Verwijderen…' : 'Verwijderen'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detail Modal */}
      <IngredientGroupDetailModal
        open={showDetailModal}
        onClose={handleCloseModal}
        category={selectedCategory}
        dietTypeId={dietTypeId}
        dietTypeName={dietTypeName}
        items={categoryItems}
        totalCount={itemsTotalCount}
        hasMore={itemsHasMore}
        isLoadingItems={isLoadingItems}
        onItemsChanged={handleItemsChanged}
      />
    </div>
  );
}
