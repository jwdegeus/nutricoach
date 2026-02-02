'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { Link } from '@/components/catalyst/link';
import {
  getIngredientCategoryAction,
  getNevoFoodGroupsAction,
  updateIngredientCategoryAction,
  readIngredientCategoryItemsAction,
  addIngredientCategoryItemAction,
  deleteIngredientCategoryItemAction,
  updateIngredientCategoryItemAction,
  generateIngredientSuggestionsAction,
  searchNevoIngredientsForCategoryAction,
  addNevoIngredientToCategoryAction,
  deduplicateCategoryItemsAction,
} from '@/src/app/(app)/settings/actions/ingredient-categories-admin.actions';
import { useToast } from '@/src/components/app/ToastContext';
import {
  ArrowLeftIcon,
  PlusIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from '@heroicons/react/20/solid';
import { ArrowPathIcon } from '@heroicons/react/16/solid';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Textarea } from '@/components/catalyst/textarea';
import { Text } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import { Field, Label, Description } from '@/components/catalyst/fieldset';

type Category = {
  id: string;
  code: string;
  name_nl: string;
  name_en: string | null;
  is_active: boolean;
  nevo_food_groups_nl?: string[];
  nevo_food_groups_en?: string[];
};

type CategoryItem = {
  id: string;
  term: string;
  term_nl: string | null;
  synonyms: string[];
  display_order: number;
  is_active: boolean;
  subgroup_id: string | null;
  nevo_food_id: number | null;
};

type NevoSearchHit = {
  id: number;
  nevo_code: number;
  name_nl: string;
  name_en: string;
  food_group_nl: string;
};

type NevoFoodGroup = { food_group_nl: string; food_group_en: string };

export function IngredientGroupDetailPageClient({
  groupId,
}: {
  groupId: string;
}) {
  const { showToast } = useToast();
  const [category, setCategory] = useState<Category | null>(null);
  const [nevoGroups, setNevoGroups] = useState<NevoFoodGroup[]>([]);
  const [items, setItems] = useState<CategoryItem[]>([]);
  const [itemsTotalCount, setItemsTotalCount] = useState(0);
  const [_itemsHasMore, setItemsHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Group settings form
  const [nameNl, setNameNl] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nevoGroupsNl, setNevoGroupsNl] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Add ingredient state
  const [newTagInput, setNewTagInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<
    Array<{ term: string; termNl: string | null; synonyms: string[] }>
  >([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(
    new Set(),
  );

  // Edit item state
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);
  const [editTermNl, setEditTermNl] = useState('');
  const [editSynonymsStr, setEditSynonymsStr] = useState('');
  const [itemEditError, setItemEditError] = useState<string | null>(null);

  // NEVO search state
  const [nevoSearchQuery, setNevoSearchQuery] = useState('');
  const [nevoSearchResults, setNevoSearchResults] = useState<NevoSearchHit[]>(
    [],
  );
  const [nevoSearchLoading, setNevoSearchLoading] = useState(false);
  const [nevoAddError, setNevoAddError] = useState<string | null>(null);

  // Ontdubbelen state
  const [dedupeResult, setDedupeResult] = useState<{ removed: number } | null>(
    null,
  );

  // NEVO: multi-select en drag naar groep
  const [selectedNevoIds, setSelectedNevoIds] = useState<Set<number>>(
    new Set(),
  );
  const [draggedNevoId, setDraggedNevoId] = useState<number | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState(false);

  // Bulk select (ingrediënten in groep)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(),
  );

  const internalItemsRef = useRef<CategoryItem[]>([]);

  const loadCategory = async () => {
    setLoading(true);
    setError(null);
    const [catResult, nevoResult] = await Promise.all([
      getIngredientCategoryAction(groupId),
      getNevoFoodGroupsAction(),
    ]);
    if (catResult.ok && catResult.data) {
      setCategory(catResult.data);
      setNameNl(catResult.data.name_nl);
      setNameEn(catResult.data.name_en ?? '');
      setNevoGroupsNl(catResult.data.nevo_food_groups_nl ?? []);
      setIsActive(catResult.data.is_active);
    } else if (catResult.ok && !catResult.data) {
      setError('Ingredientgroep niet gevonden');
      setCategory(null);
    } else if (!catResult.ok) {
      setError(catResult.error?.message ?? 'Laden mislukt');
      setCategory(null);
    }
    if (nevoResult.ok) setNevoGroups(nevoResult.data);
    setLoading(false);
  };

  const loadItems = async () => {
    if (!groupId) return;
    setLoadingItems(true);
    const result = await readIngredientCategoryItemsAction(groupId, 100);
    setLoadingItems(false);
    if (result.ok) {
      setItems(result.data.items);
      setItemsTotalCount(result.data.total_count);
      setItemsHasMore(result.data.has_more);
      internalItemsRef.current = result.data.items;
    }
  };

  useEffect(() => {
    loadCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCategory stable, run when groupId changes
  }, [groupId]);

  useEffect(() => {
    if (category) loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when category id changes only
  }, [category?.id]);

  const refreshItems = () => {
    loadItems();
    loadCategory();
  };

  const handleSaveSettings = () => {
    if (!category) return;
    if (!nameNl.trim()) {
      setSettingsError('Naam (NL) is verplicht');
      return;
    }
    setSettingsError(null);
    startTransition(async () => {
      const groupsEn = nevoGroupsNl.map(
        (nl) =>
          nevoGroups.find((g) => g.food_group_nl === nl)?.food_group_en ?? '',
      );
      const result = await updateIngredientCategoryAction(category.id, {
        name_nl: nameNl.trim(),
        name_en: nameEn.trim() || null,
        nevo_food_groups_nl: nevoGroupsNl,
        nevo_food_groups_en: groupsEn,
        is_active: isActive,
      });
      if (result.ok) {
        setCategory((c) =>
          c
            ? {
                ...c,
                name_nl: nameNl.trim(),
                name_en: nameEn.trim() || null,
                nevo_food_groups_nl: nevoGroupsNl,
                is_active: isActive,
              }
            : c,
        );
      } else {
        setSettingsError(result.error?.message ?? 'Opslaan mislukt');
      }
    });
  };

  const handleAddTag = () => {
    if (!category) return;
    setAddError(null);
    setAddSuccess(null);
    const term = newTagInput.trim();
    if (!term) {
      setAddError('Voer een term in');
      return;
    }
    startTransition(async () => {
      try {
        const result = await addIngredientCategoryItemAction({
          categoryId: category.id,
          term: term.toLowerCase(),
          termNl: term,
          synonyms: [],
        });
        if (!result.ok) {
          setAddError(result.error.message);
          return;
        }
        setAddSuccess(`"${term}" toegevoegd`);
        setNewTagInput('');
        refreshItems();
      } catch {
        setAddError('Onverwachte fout bij toevoegen');
      }
    });
  };

  const handleAIGenerate = async (append = false) => {
    if (!category) return;
    setIsGeneratingAI(true);
    setAddError(null);
    if (!append) {
      setAiSuggestions([]);
      setSelectedSuggestions(new Set());
    }
    try {
      const result = await generateIngredientSuggestionsAction({
        categoryId: category.id,
        categoryName: category.name_nl,
        categoryCode: category.code,
        limit: 30,
        excludeTerms: append ? aiSuggestions.map((s) => s.term) : undefined,
      });
      if (!result.ok) {
        setAddError(result.error.message);
        return;
      }
      if (result.data?.suggestions?.length) {
        if (append) {
          setAiSuggestions((prev) => [...prev, ...result.data!.suggestions]);
        } else {
          setAiSuggestions(result.data.suggestions);
        }
      } else if (!append) {
        setAddError('Geen nieuwe suggesties gevonden');
      }
    } catch {
      setAddError('Onverwachte fout bij AI generatie');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleAddSelectedSuggestions = () => {
    if (!category || selectedSuggestions.size === 0) return;
    setAddError(null);
    setAddSuccess(null);
    const toAdd = aiSuggestions.filter((s) => selectedSuggestions.has(s.term));
    if (toAdd.length === 0) return;
    startTransition(async () => {
      try {
        let added = 0;
        for (const s of toAdd) {
          const termNl = s.termNl || s.term;
          const result = await addIngredientCategoryItemAction({
            categoryId: category.id,
            term: termNl.toLowerCase(),
            termNl,
            synonyms: s.synonyms,
          });
          if (result.ok) added++;
        }
        setAddSuccess(`${added} ingrediënt(en) toegevoegd`);
        setSelectedSuggestions(new Set());
        setAiSuggestions([]);
        refreshItems();
      } catch {
        setAddError('Onverwachte fout bij toevoegen');
      }
    });
  };

  const handleAddAllSuggestions = () => {
    if (!category || aiSuggestions.length === 0) return;
    setAddError(null);
    setAddSuccess(null);
    startTransition(async () => {
      try {
        let added = 0;
        for (const s of aiSuggestions) {
          const termNl = s.termNl || s.term;
          const result = await addIngredientCategoryItemAction({
            categoryId: category.id,
            term: termNl.toLowerCase(),
            termNl,
            synonyms: s.synonyms,
          });
          if (result.ok) added++;
        }
        setAddSuccess(`${added} ingrediënt(en) toegevoegd`);
        setSelectedSuggestions(new Set());
        setAiSuggestions([]);
        refreshItems();
      } catch {
        setAddError('Onverwachte fout bij toevoegen');
      }
    });
  };

  const handleToggleSuggestion = (term: string) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  };

  const handleOpenItemEdit = (item: CategoryItem) => {
    setEditingItem(item);
    setEditTermNl(item.term_nl ?? '');
    setEditSynonymsStr(item.synonyms.join('\n'));
    setItemEditError(null);
  };

  const handleSaveItemEdit = () => {
    if (!editingItem) return;
    setItemEditError(null);
    startTransition(async () => {
      try {
        const synonyms = editSynonymsStr
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        const result = await updateIngredientCategoryItemAction(
          editingItem.id,
          {
            term_nl: editTermNl.trim() || null,
            synonyms,
          },
        );
        if (!result.ok) {
          setItemEditError(result.error.message);
          return;
        }
        setEditingItem(null);
        refreshItems();
      } catch {
        setItemEditError('Onverwachte fout bij opslaan');
      }
    });
  };

  const handleDeleteItem = (itemId: string) => {
    startTransition(async () => {
      try {
        const result = await deleteIngredientCategoryItemAction(itemId);
        if (!result.ok) {
          setAddError(result.error.message);
          showToast({
            type: 'error',
            title: result.error.message,
          });
          return;
        }
        setAddError(null);
        showToast({
          type: 'success',
          title: 'Ingrediënt verwijderd',
        });
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        setItemsTotalCount((c) => Math.max(0, c - 1));
        internalItemsRef.current = internalItemsRef.current.filter(
          (i) => i.id !== itemId,
        );
      } catch {
        setAddError('Onverwachte fout bij verwijderen');
        showToast({
          type: 'error',
          title: 'Onverwachte fout bij verwijderen',
        });
      }
    });
  };

  const handleNevoSearch = async () => {
    if (!category) return;
    setNevoSearchLoading(true);
    setNevoAddError(null);
    const result = await searchNevoIngredientsForCategoryAction(
      category.id,
      nevoSearchQuery.trim() || undefined,
    );
    setNevoSearchLoading(false);
    if (result.ok) {
      setNevoSearchResults(result.data);
    } else {
      setNevoAddError(result.error?.message ?? 'Zoeken mislukt');
    }
  };

  const handleAddNevoIngredient = (nevoFoodId: number) => {
    if (!category) return;
    setNevoAddError(null);
    startTransition(async () => {
      const result = await addNevoIngredientToCategoryAction(
        category.id,
        nevoFoodId,
      );
      if (result.ok) {
        setNevoSearchResults((prev) => prev.filter((f) => f.id !== nevoFoodId));
        refreshItems();
      } else {
        setNevoAddError(result.error?.message ?? 'Toevoegen mislukt');
      }
    });
  };

  const handleDeduplicate = () => {
    if (!category) return;
    setDedupeResult(null);
    startTransition(async () => {
      const result = await deduplicateCategoryItemsAction(category.id);
      if (result.ok) {
        setDedupeResult({ removed: result.data.removed });
        refreshItems();
      } else {
        setAddError(result.error?.message ?? 'Ontdubbelen mislukt');
      }
    });
  };

  const displayItems = items.length > 0 ? items : internalItemsRef.current;

  const toggleSelectItem = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectAllItems = () => {
    setSelectedItemIds(new Set(displayItems.map((i) => i.id)));
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedItemIds.size === 0 || !category) return;
    const ids = Array.from(selectedItemIds);
    setAddError(null);
    startTransition(async () => {
      const deletedIds = new Set<string>();
      let failed = 0;
      for (const id of ids) {
        const result = await deleteIngredientCategoryItemAction(id);
        if (result.ok) deletedIds.add(id);
        else failed++;
      }
      setSelectedItemIds(new Set());
      if (failed > 0) {
        setAddError(`${failed} van ${ids.length} verwijderen mislukt`);
        showToast({
          type: 'error',
          title: `${failed} van ${ids.length} verwijderen mislukt`,
        });
      }
      if (deletedIds.size > 0) {
        showToast({
          type: 'success',
          title:
            deletedIds.size === 1
              ? 'Ingrediënt verwijderd'
              : `${deletedIds.size} ingrediënten verwijderd`,
        });
        setItems((prev) => prev.filter((i) => !deletedIds.has(i.id)));
        setItemsTotalCount((c) => Math.max(0, c - deletedIds.size));
        internalItemsRef.current = internalItemsRef.current.filter(
          (i) => !deletedIds.has(i.id),
        );
      }
    });
  };

  const toggleSelectedNevo = (nevoFoodId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedNevoIds((prev) => {
      const next = new Set(prev);
      if (next.has(nevoFoodId)) next.delete(nevoFoodId);
      else next.add(nevoFoodId);
      return next;
    });
  };

  const addNevoIdsToGroup = async (nevoIds: number[]) => {
    if (!category || nevoIds.length === 0) return;
    setNevoAddError(null);
    const added: number[] = [];
    const failed: number[] = [];
    for (const id of nevoIds) {
      const result = await addNevoIngredientToCategoryAction(category.id, id);
      if (result.ok) added.push(id);
      else failed.push(id);
    }
    setNevoSearchResults((prev) => prev.filter((f) => !added.includes(f.id)));
    setSelectedNevoIds((prev) => {
      const next = new Set(prev);
      added.forEach((id) => next.delete(id));
      return next;
    });
    if (failed.length > 0) {
      setNevoAddError(
        `${failed.length} van ${nevoIds.length} toevoegen mislukt`,
      );
    }
    loadItems();
  };

  const handleNevoDragStart = (e: React.DragEvent, hit: NevoSearchHit) => {
    const idsToAdd = selectedNevoIds.has(hit.id)
      ? Array.from(selectedNevoIds)
      : [hit.id];
    setDraggedNevoId(hit.id);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ type: 'nevo', ids: idsToAdd }),
    );
    e.dataTransfer.setData('text/plain', idsToAdd.join(','));
  };

  const handleNevoDragEnd = () => {
    setDraggedNevoId(null);
    setDragOverGroup(false);
  };

  const handleGroupDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = e.dataTransfer.getData('application/json');
      if (data && JSON.parse(data).type === 'nevo') {
        e.dataTransfer.dropEffect = 'copy';
        setDragOverGroup(true);
      }
    } catch {
      // ignore
    }
  };

  const handleGroupDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverGroup(false);
    }
  };

  const handleGroupDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverGroup(false);
    setDraggedNevoId(null);
    if (!category) return;
    try {
      const data = e.dataTransfer.getData('application/json');
      const payload = data ? JSON.parse(data) : null;
      if (
        payload?.type === 'nevo' &&
        Array.isArray(payload.ids) &&
        payload.ids.length > 0
      ) {
        const ids = payload.ids as number[];
        startTransition(() => addNevoIdsToGroup(ids));
      }
    } catch {
      setNevoAddError('Ongeldige drop-data');
    }
  };

  const handleAddSelectedNevo = () => {
    if (selectedNevoIds.size === 0 || !category) return;
    startTransition(() => addNevoIdsToGroup(Array.from(selectedNevoIds)));
  };

  const hasNevoGroups = (category?.nevo_food_groups_nl?.length ?? 0) > 0;

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-zinc-500 dark:text-zinc-400">Laden...</p>
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="p-6 space-y-4">
        <Link
          href="/admin/ingredients?tab=groups"
          className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Terug naar ingredientgroepen
        </Link>
        <p className="text-red-600 dark:text-red-400">
          {error ?? 'Groep niet gevonden'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/admin/ingredients?tab=groups"
          className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Terug naar ingredientgroepen
        </Link>
        <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
          {category.name_nl}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Code: <code className="font-mono">{category.code}</code>
        </p>
      </div>

      {/* Groepinstellingen */}
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          Groepinstellingen
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label>Naam (NL) *</Label>
            <Input
              value={nameNl}
              onChange={(e) => setNameNl(e.target.value)}
              placeholder="bijv. Glutenhoudende granen"
              disabled={isPending}
            />
          </Field>
          <Field>
            <Label>Naam (EN)</Label>
            <Input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="optional"
              disabled={isPending}
            />
          </Field>
        </div>
        <Field>
          <Label>NEVO groepen</Label>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-800">
            <div className="space-y-1.5">
              {nevoGroups.map((g) => (
                <label
                  key={g.food_group_nl}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                >
                  <input
                    type="checkbox"
                    checked={nevoGroupsNl.includes(g.food_group_nl)}
                    onChange={() => {
                      setNevoGroupsNl((prev) =>
                        prev.includes(g.food_group_nl)
                          ? prev.filter((x) => x !== g.food_group_nl)
                          : [...prev, g.food_group_nl],
                      );
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
        </Field>
        <Field>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="group-is_active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
            />
            <Label htmlFor="group-is_active">Actief</Label>
          </div>
        </Field>
        {settingsError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {settingsError}
          </p>
        )}
        <Button onClick={handleSaveSettings} disabled={isPending}>
          {isPending ? 'Opslaan...' : 'Instellingen opslaan'}
        </Button>
      </section>

      {/* Ingrediënten toevoegen */}
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          Ingrediënten toevoegen
        </h2>
        <div className="flex flex-wrap gap-2">
          <Input
            value={newTagInput}
            onChange={(e) => {
              setNewTagInput(e.target.value);
              setAddError(null);
              setAddSuccess(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTagInput.trim()) {
                e.preventDefault();
                handleAddTag();
              }
            }}
            placeholder="Voer een term in en druk op Enter..."
            disabled={isPending || isGeneratingAI}
            className="flex-1 min-w-[200px]"
          />
          <Button
            onClick={handleAddTag}
            disabled={isPending || isGeneratingAI || !newTagInput.trim()}
          >
            <PlusIcon className="h-4 w-4" />
            Handmatig toevoegen
          </Button>
          <Button
            onClick={() => handleAIGenerate(false)}
            disabled={isGeneratingAI || isPending}
            color="zinc"
          >
            {isGeneratingAI ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <SparklesIcon className="h-4 w-4" />
            )}
            {isGeneratingAI ? 'AI zoekt...' : 'AI: Vind ingrediënten'}
          </Button>
        </div>

        {aiSuggestions.length > 0 && (
          <div className="space-y-2">
            <Text className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              AI Suggesties ({selectedSuggestions.size} geselecteerd):
            </Text>
            <div className="flex flex-wrap gap-2">
              {aiSuggestions.map((s) => (
                <Badge
                  key={s.term}
                  color={selectedSuggestions.has(s.term) ? 'blue' : 'zinc'}
                  className="cursor-pointer text-xs"
                  onClick={() => handleToggleSuggestion(s.term)}
                >
                  {s.term}
                  {s.termNl && s.termNl !== s.term && (
                    <span className="ml-1 opacity-75">({s.termNl})</span>
                  )}
                  {s.synonyms.length > 0 && (
                    <span className="ml-1 opacity-60">
                      +{s.synonyms.length} syn.
                    </span>
                  )}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedSuggestions.size > 0 && (
                <Button
                  onClick={handleAddSelectedSuggestions}
                  disabled={isPending}
                  className="text-sm"
                >
                  <PlusIcon className="h-3 w-3" />
                  {selectedSuggestions.size} geselecteerde toevoegen
                </Button>
              )}
              <Button
                onClick={handleAddAllSuggestions}
                disabled={isPending}
                className="text-sm"
                color="blue"
              >
                <PlusIcon className="h-3 w-3" />
                Alles toevoegen ({aiSuggestions.length})
              </Button>
              <Button
                onClick={() => handleAIGenerate(true)}
                disabled={isGeneratingAI || isPending}
                className="text-sm"
                plain
              >
                <SparklesIcon className="h-3 w-3" />
                Meer suggesties
              </Button>
            </div>
          </div>
        )}

        {/* Zoek NEVO-ingrediënt (alleen als groep NEVO-groepen heeft) */}
        {hasNevoGroups && (
          <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/30">
            <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Zoek NEVO-ingrediënt
            </Text>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              Alleen ingrediënten uit de gekoppelde NEVO-groepen. Elk
              NEVO-ingrediënt kan maar aan één groep toegevoegd worden.
            </Text>
            <div className="flex flex-wrap gap-2">
              <Input
                value={nevoSearchQuery}
                onChange={(e) => {
                  setNevoSearchQuery(e.target.value);
                  setNevoAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleNevoSearch();
                  }
                }}
                placeholder="Zoek op naam..."
                disabled={nevoSearchLoading}
                className="flex-1 min-w-[200px]"
              />
              <Button onClick={handleNevoSearch} disabled={nevoSearchLoading}>
                {nevoSearchLoading ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <MagnifyingGlassIcon className="h-4 w-4" />
                )}
                {nevoSearchLoading ? 'Zoeken...' : 'Zoeken'}
              </Button>
            </div>
            {nevoAddError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {nevoAddError}
              </p>
            )}
            {nevoSearchResults.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Text className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Resultaten ({nevoSearchResults.length}): sleep naar de groep
                    of selecteer meerdere
                  </Text>
                  {selectedNevoIds.size > 0 && (
                    <Button
                      onClick={handleAddSelectedNevo}
                      disabled={isPending}
                      className="text-xs"
                    >
                      <PlusIcon className="h-3 w-3" />
                      {selectedNevoIds.size} geselecteerde toevoegen
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {nevoSearchResults.map((hit) => (
                    <div
                      key={hit.id}
                      draggable
                      onDragStart={(e) => handleNevoDragStart(e, hit)}
                      onDragEnd={handleNevoDragEnd}
                      className={`flex items-center gap-1 rounded-lg ${
                        draggedNevoId === hit.id ? 'opacity-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedNevoIds.has(hit.id)}
                        onChange={() => toggleSelectedNevo(hit.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                        aria-label={`Selecteer ${hit.name_nl}`}
                      />
                      <Badge
                        color="blue"
                        className="text-xs cursor-grab active:cursor-grabbing"
                      >
                        {hit.name_nl}
                        <button
                          type="button"
                          onClick={() => handleAddNevoIngredient(hit.id)}
                          disabled={isPending}
                          className="ml-1.5 rounded hover:bg-blue-600/20 px-0.5 disabled:opacity-50"
                          title="Toevoegen aan groep"
                        >
                          <PlusIcon className="h-3 w-3" />
                        </button>
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {nevoSearchQuery.trim() &&
              !nevoSearchLoading &&
              nevoSearchResults.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Geen NEVO-ingrediënten gevonden. Mogelijk al aan een andere
                  groep gekoppeld.
                </p>
              )}
          </div>
        )}

        {addError && (
          <div className="rounded-lg bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {addError}
          </div>
        )}
        {addSuccess && (
          <div className="rounded-lg bg-green-50 p-2 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
            {addSuccess}
          </div>
        )}
      </section>

      {/* Lijst ingrediënten (dropzone voor NEVO-labels) */}
      <section
        className={`rounded-lg border p-4 space-y-4 transition-colors ${
          dragOverGroup
            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 dark:border-blue-500'
            : 'border-zinc-200 dark:border-zinc-700'
        }`}
        onDragOver={handleGroupDragOver}
        onDragLeave={handleGroupDragLeave}
        onDrop={handleGroupDrop}
      >
        {dragOverGroup && (
          <p className="text-sm text-blue-600 dark:text-blue-400">
            Laat los om NEVO-ingrediënt(en) aan de groep toe te voegen
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Ingrediënten in deze groep ({itemsTotalCount})
          </h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-500"
                aria-hidden
              />
              Eigen NutriCoach-label
            </span>
            {' · '}
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full bg-green-500"
                aria-hidden
              />
              Gekoppeld aan NEVO
            </span>
            {' · '}
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full bg-blue-500"
                aria-hidden
              />
              FNDDS (toekomstig)
            </span>
          </span>
          {hasNevoGroups && (
            <Button
              onClick={handleDeduplicate}
              disabled={isPending}
              outline={true}
              className="text-sm"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Ontdubbelen
            </Button>
          )}
        </div>
        {dedupeResult !== null && (
          <p className="text-sm text-green-600 dark:text-green-400">
            {dedupeResult.removed === 0
              ? 'Geen dubbele (eigen) ingrediënten gevonden; NEVO heeft voorrang.'
              : `${dedupeResult.removed} dubbele eigen ingrediënt(en) verwijderd.`}
          </p>
        )}
        {displayItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              plain
              onClick={selectAllItems}
              disabled={loadingItems}
              className="text-sm"
            >
              Selecteer alles
            </Button>
            {selectedItemIds.size > 0 && (
              <>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {selectedItemIds.size} geselecteerd
                </span>
                <Button plain onClick={clearSelection} className="text-sm">
                  Deselecteer alles
                </Button>
                <Button
                  onClick={handleBulkDelete}
                  disabled={isPending}
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  <TrashIcon className="h-4 w-4" />
                  Verwijder geselecteerde
                </Button>
              </>
            )}
          </div>
        )}
        {loadingItems ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Laden...</p>
        ) : displayItems.length > 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 max-h-96 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {displayItems.map((item) =>
                editingItem?.id === item.id ? (
                  <div
                    key={item.id}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50 space-y-3"
                  >
                    <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Bewerk: {item.term}
                    </Text>
                    <Field>
                      <Label>Nederlandse naam (term_nl)</Label>
                      <Input
                        value={editTermNl}
                        onChange={(e) => setEditTermNl(e.target.value)}
                        placeholder="bijv. pasta, spinazie"
                        disabled={isPending}
                      />
                    </Field>
                    <Field>
                      <Label>Synoniemen</Label>
                      <Description>Één synoniem per regel</Description>
                      <Textarea
                        value={editSynonymsStr}
                        onChange={(e) => setEditSynonymsStr(e.target.value)}
                        placeholder="spaghetti\npenne\nfusilli"
                        disabled={isPending}
                        rows={4}
                        className="mt-1"
                      />
                    </Field>
                    {itemEditError && (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {itemEditError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveItemEdit}
                        disabled={isPending}
                        className="text-sm"
                      >
                        Opslaan
                      </Button>
                      <Button
                        onClick={() => {
                          setEditingItem(null);
                          setItemEditError(null);
                        }}
                        outline
                        disabled={isPending}
                        className="text-sm"
                      >
                        Annuleren
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={item.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.has(item.id)}
                      onChange={() => toggleSelectItem(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                      aria-label={`Selecteer ${item.term_nl || item.term}`}
                    />
                    <Badge
                      color={item.nevo_food_id != null ? 'green' : 'zinc'}
                      className="group relative text-xs cursor-pointer"
                      onClick={() => handleOpenItemEdit(item)}
                      title={
                        item.nevo_food_id != null
                          ? 'Gekoppeld aan NEVO'
                          : 'Eigen NutriCoach-label (geen koppeling)'
                      }
                    >
                      <span className="pr-0.5">
                        {item.term_nl || item.term}
                        {item.synonyms.length > 0 && (
                          <span className="ml-1 opacity-60">
                            +{item.synonyms.length} syn.
                          </span>
                        )}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteItem(item.id);
                        }}
                        className="ml-1 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-400"
                        disabled={isPending}
                        title="Verwijderen"
                      >
                        ×
                      </button>
                    </Badge>
                  </div>
                ),
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Geen ingrediënten in deze groep. Voeg handmatig of via AI toe.
          </p>
        )}
      </section>
    </div>
  );
}
