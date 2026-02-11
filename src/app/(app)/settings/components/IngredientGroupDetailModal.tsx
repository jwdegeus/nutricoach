'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog';
import { Input } from '@/components/catalyst/input';
import { Textarea } from '@/components/catalyst/textarea';
import { Text } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import { Button } from '@/components/catalyst/button';
import { Field, Label, Description } from '@/components/catalyst/fieldset';
import { PlusIcon, PencilIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { ArrowPathIcon } from '@heroicons/react/16/solid';
import {
  addIngredientCategoryItemAction,
  deleteIngredientCategoryItemAction,
  generateIngredientSuggestionsAction,
  updateIngredientCategoryAction,
  updateIngredientCategoryOriginAction,
  updateIngredientCategoryItemAction,
} from '../actions/ingredient-categories-admin.actions';

type IngredientGroupDetailModalProps = {
  open: boolean;
  onClose: () => void;
  category: {
    id: string;
    code: string;
    name_nl: string;
    is_diet_specific?: boolean;
  } | null;
  /** Required to show and change Herkomst (origin). */
  dietTypeId?: string;
  /** Diet type display name, e.g. "Wahls Paleo", used in Herkomst label. */
  dietTypeName?: string;
  items: Array<{
    id: string;
    term: string;
    term_nl: string | null;
    synonyms: string[];
    display_order: number;
    is_active: boolean;
    subgroup_id: string | null;
  }>;
  totalCount: number;
  hasMore: boolean;
  isLoadingItems?: boolean;
  onItemsChanged?: () => void; // Callback to refresh items list
};

export function IngredientGroupDetailModal({
  open,
  onClose,
  category,
  dietTypeId,
  dietTypeName,
  items,
  totalCount,
  hasMore: _hasMore,
  isLoadingItems = false,
  onItemsChanged,
}: IngredientGroupDetailModalProps) {
  const [isPending, startTransition] = useTransition();

  // Edit category name state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [_editNameError, setEditNameError] = useState<string | null>(null);

  // Edit category code (slug) state
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [editCode, setEditCode] = useState('');
  const [editCodeError, setEditCodeError] = useState<string | null>(null);

  // Herkomst (origin) change state
  const [originError, setOriginError] = useState<string | null>(null);

  // Tag-based add state
  const [newTagInput, setNewTagInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<
    Array<{
      term: string;
      termNl: string | null;
      synonyms: string[];
    }>
  >([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(
    new Set(),
  );

  // Edit item (term_nl, synonyms) state – clicking a tag opens this
  type Item = (typeof items)[number];
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editTermNl, setEditTermNl] = useState('');
  const [editSynonymsStr, setEditSynonymsStr] = useState('');
  const [itemEditError, setItemEditError] = useState<string | null>(null);

  // Internal items state for live updates (prevents flicker when parent reloads)
  const [internalItems, setInternalItems] = useState(items);
  const prevItemsRef = useRef(items);
  const prevCategoryIdRef = useRef(category?.id);

  // Clear item edit when modal closes
  useEffect(() => {
    if (!open) setEditingItem(null);
  }, [open]);

  // Update internal items when category changes or when items prop has new data
  // Use refs to track changes without causing dependency array issues
  const categoryIdStable = category?.id ?? null;
  useEffect(() => {
    const categoryId = categoryIdStable;
    const categoryChanged = categoryId !== prevCategoryIdRef.current;

    if (categoryChanged) {
      // Category changed, reset items and close item edit
      setEditingItem(null);
      if (items && items.length > 0) {
        setInternalItems(items);
        prevItemsRef.current = items;
      }
      prevCategoryIdRef.current = categoryId ?? undefined;
    } else if (items && items.length > 0 && items !== prevItemsRef.current) {
      // Items changed (different reference), update internal state
      setInternalItems(items);
      prevItemsRef.current = items;
    }
    // If items prop is empty but we have internal items, keep internal items
    // (this prevents flicker during reload)
  }, [categoryIdStable, items.length]);

  // Use internal items for display
  const filteredItems = internalItems;

  // Handle add tag (single term) - only Dutch
  function handleAddTag() {
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
          subgroupId: null,
          term: term.toLowerCase(), // Store as lowercase
          termNl: term, // Dutch term
          synonyms: [],
        });

        if (!result.ok) {
          setAddError(result.error.message);
          return;
        }

        // Optimistically add item to internal state
        if (result.data) {
          setInternalItems((prevItems) => [
            ...prevItems,
            {
              id: result.data!.id,
              term: term.toLowerCase(),
              term_nl: term,
              synonyms: [],
              display_order: 0,
              is_active: true,
              subgroup_id: null,
            },
          ]);
        }

        setAddSuccess(`"${term}" toegevoegd`);
        setNewTagInput('');
        // Trigger parent reload in background (but don't wait for it)
        onItemsChanged?.();
      } catch (_err) {
        setAddError('Onverwachte fout bij toevoegen');
        // Revert on error by reloading from parent
        onItemsChanged?.();
      }
    });
  }

  // Handle add selected AI suggestions
  function handleAddSelectedSuggestions() {
    if (!category || selectedSuggestions.size === 0) return;

    setAddError(null);
    setAddSuccess(null);

    const toAdd = aiSuggestions.filter((s) => selectedSuggestions.has(s.term));
    if (toAdd.length === 0) return;

    startTransition(async () => {
      try {
        let added = 0;
        const errors: string[] = [];

        for (const suggestion of toAdd) {
          // Use Dutch term as primary, fallback to English if no Dutch
          const termNl = suggestion.termNl || suggestion.term;
          const result = await addIngredientCategoryItemAction({
            categoryId: category.id,
            subgroupId: null,
            term: termNl.toLowerCase(), // Store as lowercase
            termNl: termNl, // Dutch term
            synonyms: suggestion.synonyms,
          });

          if (result.ok) {
            added++;
          } else {
            errors.push(`${suggestion.term}: ${result.error.message}`);
          }
        }

        if (added > 0) {
          setAddSuccess(`${added} ingrediënt(en) toegevoegd`);
        }
        if (errors.length > 0) {
          setAddError(
            `${errors.length} fout(en): ${errors.slice(0, 3).join(', ')}`,
          );
        }

        setSelectedSuggestions(new Set());
        setAiSuggestions([]);
        onItemsChanged?.();
      } catch (_err) {
        setAddError('Onverwachte fout bij toevoegen');
      }
    });
  }

  // Handle add all AI suggestions
  function handleAddAllSuggestions() {
    if (!category || aiSuggestions.length === 0) return;

    setAddError(null);
    setAddSuccess(null);

    const allTerms = new Set(aiSuggestions.map((s) => s.term));
    setSelectedSuggestions(allTerms);

    startTransition(async () => {
      try {
        let added = 0;
        const errors: string[] = [];

        for (const suggestion of aiSuggestions) {
          const termNl = suggestion.termNl || suggestion.term;
          const result = await addIngredientCategoryItemAction({
            categoryId: category.id,
            subgroupId: null,
            term: termNl.toLowerCase(),
            termNl: termNl,
            synonyms: suggestion.synonyms,
          });

          if (result.ok) {
            added++;
          } else {
            errors.push(`${suggestion.term}: ${result.error.message}`);
          }
        }

        if (added > 0) {
          setAddSuccess(`${added} ingrediënt(en) toegevoegd`);
        }
        if (errors.length > 0) {
          setAddError(
            `${errors.length} fout(en): ${errors.slice(0, 3).join(', ')}`,
          );
        }

        setSelectedSuggestions(new Set());
        setAiSuggestions([]);
        onItemsChanged?.();
      } catch (_err) {
        setAddError('Onverwachte fout bij toevoegen');
      }
    });
  }

  // Generate ingredient suggestions (no subgroup). append = "Meer suggesties": voeg toe aan bestaande.
  async function handleAIGenerateIngredients(append = false) {
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

      if (result.data && result.data.suggestions.length > 0) {
        if (append) {
          setAiSuggestions((prev) => [...prev, ...result.data!.suggestions]);
        } else {
          setAiSuggestions(result.data.suggestions);
        }
      } else if (!append) {
        setAddError(
          'Geen nieuwe suggesties gevonden (mogelijk zijn alle relevante ingrediënten al toegevoegd)',
        );
      }
      // bij append en 0 nieuwe: geen fout, gewoon niets toegevoegd
    } catch (_err) {
      setAddError('Onverwachte fout bij AI generatie');
    } finally {
      setIsGeneratingAI(false);
    }
  }

  // Toggle suggestion selection
  function handleToggleSuggestion(term: string) {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(term)) {
      newSelected.delete(term);
    } else {
      newSelected.add(term);
    }
    setSelectedSuggestions(newSelected);
  }

  // Open item edit (term_nl, synonyms)
  function handleOpenItemEdit(item: Item) {
    setEditingItem(item);
    setEditTermNl(item.term_nl ?? '');
    setEditSynonymsStr(item.synonyms.join('\n'));
    setItemEditError(null);
  }

  // Save item edit
  function handleSaveItemEdit() {
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
        onItemsChanged?.();
      } catch {
        setItemEditError('Onverwachte fout bij opslaan');
      }
    });
  }

  // Cancel item edit
  function handleCancelItemEdit() {
    setEditingItem(null);
    setItemEditError(null);
  }

  // Handle delete - direct without confirmation
  function handleDeleteItem(itemId: string) {
    startTransition(async () => {
      try {
        // Optimistically remove item from internal state
        setInternalItems((prevItems) =>
          prevItems.filter((item) => item.id !== itemId),
        );

        const result = await deleteIngredientCategoryItemAction(itemId);
        if (!result.ok) {
          setAddError(result.error.message);
          onItemsChanged?.();
          return;
        }
        onItemsChanged?.();
      } catch (_err) {
        setAddError('Onverwachte fout bij verwijderen');
        onItemsChanged?.();
      }
    });
  }

  // Initialize edit name and code when category changes (incl. refresh after save)
  // Fixed length-3 array so React dependency array size never changes (required by React)
  const catId = category?.id ?? null;
  const catName = category?.name_nl ?? null;
  const catCode = category?.code ?? null;
  useEffect(() => {
    if (category) {
      setEditName(category.name_nl);
      setEditCode(category.code);
    }
  }, [catId, catName, catCode]);

  // Handle save category name
  function handleSaveCategoryName() {
    if (!category) return;

    if (!editName.trim()) {
      setEditNameError('Groepsnaam is verplicht');
      return;
    }

    setEditNameError(null);
    startTransition(async () => {
      try {
        const result = await updateIngredientCategoryAction(category.id, {
          name_nl: editName.trim(),
        });

        if (!result.ok) {
          setEditNameError(result.error.message);
          return;
        }

        setIsEditingName(false);
        // Refresh category data via callback
        onItemsChanged?.();
      } catch (_err) {
        setEditNameError('Onverwachte fout bij opslaan');
      }
    });
  }

  // Handle save category code (slug)
  function handleSaveCategoryCode() {
    if (!category) return;

    if (!editCode.trim()) {
      setEditCodeError('Slug is verplicht');
      return;
    }

    // Validate slug format (lowercase, alphanumeric and underscores only)
    const slugPattern = /^[a-z0-9_]+$/;
    if (!slugPattern.test(editCode.trim())) {
      setEditCodeError(
        'Slug mag alleen kleine letters, cijfers en underscores bevatten',
      );
      return;
    }

    setEditCodeError(null);
    startTransition(async () => {
      try {
        const result = await updateIngredientCategoryAction(category.id, {
          code: editCode.trim().toLowerCase(),
        });

        if (!result.ok) {
          setEditCodeError(result.error.message);
          return;
        }

        setIsEditingCode(false);
        // Refresh category data via callback
        onItemsChanged?.();
      } catch (_err) {
        setEditCodeError('Onverwachte fout bij opslaan');
      }
    });
  }

  // Handle change herkomst (origin): "Dit dieet" vs "Algemeen"
  function handleChangeOrigin(origin: 'diet_specific' | 'general') {
    if (!category || !dietTypeId) return;
    const current = category.is_diet_specific ? 'diet_specific' : 'general';
    if (origin === current) return;
    setOriginError(null);
    startTransition(async () => {
      try {
        const result = await updateIngredientCategoryOriginAction(
          category.id,
          dietTypeId,
          origin,
        );
        if (!result.ok) {
          setOriginError(result.error.message);
          return;
        }
        setEditCode(result.data.code);
        onItemsChanged?.();
      } catch {
        setOriginError('Onverwachte fout bij wijzigen herkomst');
      }
    });
  }

  if (!category) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        {isEditingName ? (
          <div className="flex items-center gap-2">
            <Input
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                setEditNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveCategoryName();
                } else if (e.key === 'Escape') {
                  setIsEditingName(false);
                  setEditName(category.name_nl);
                  setEditNameError(null);
                }
              }}
              className="flex-1"
              autoFocus
            />
            <Button
              onClick={handleSaveCategoryName}
              disabled={isPending || !editName.trim()}
              className="text-sm"
            >
              Opslaan
            </Button>
            <Button
              onClick={() => {
                setIsEditingName(false);
                setEditName(category.name_nl);
                setEditNameError(null);
              }}
              color="zinc"
              className="text-sm"
              disabled={isPending}
            >
              Annuleren
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span>{category.name_nl}</span>
            <Button
              onClick={() => setIsEditingName(true)}
              plain
              className="text-sm"
              disabled={isPending}
            >
              <PencilIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogTitle>
      <DialogBody>
        <DialogDescription>
          Overzicht van ingrediënttermen in deze categorie. Voeg items toe of
          verwijder ze.
        </DialogDescription>

        {/* Slug (Code) - Editable, positioned right after title */}
        <div className="mt-4">
          {isEditingCode ? (
            <div className="flex items-center gap-2">
              <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Slug:
              </Text>
              <Input
                value={editCode}
                onChange={(e) => {
                  setEditCode(e.target.value);
                  setEditCodeError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveCategoryCode();
                  } else if (e.key === 'Escape') {
                    setIsEditingCode(false);
                    setEditCode(category.code);
                    setEditCodeError(null);
                  }
                }}
                className="flex-1"
                autoFocus
                placeholder="bijv. wahls_limited_non_gluten_grains"
              />
              <Button
                onClick={handleSaveCategoryCode}
                disabled={isPending || !editCode.trim()}
                className="text-sm"
              >
                Opslaan
              </Button>
              <Button
                onClick={() => {
                  setIsEditingCode(false);
                  setEditCode(category.code);
                  setEditCodeError(null);
                }}
                color="zinc"
                className="text-sm"
                disabled={isPending}
              >
                Annuleren
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Slug:
              </Text>
              <code className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                {category.code}
              </code>
              <Button
                onClick={() => setIsEditingCode(true)}
                plain
                className="text-sm"
                disabled={isPending}
              >
                <PencilIcon className="h-3 w-3" />
              </Button>
            </div>
          )}
          {editCodeError && (
            <div className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {editCodeError}
            </div>
          )}
        </div>

        {/* Herkomst (origin): "Dit dieet" vs "Algemeen" – only when dietTypeId is set */}
        {dietTypeId && (
          <div className="mt-4">
            <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Herkomst
            </Text>
            <div className="mt-2 flex flex-wrap gap-2">
              {!category.is_diet_specific ? (
                <Button
                  className="text-sm"
                  outline
                  disabled={isPending}
                  onClick={() => handleChangeOrigin('diet_specific')}
                >
                  {dietTypeName ? `${dietTypeName} (dit dieet)` : 'Dit dieet'}
                </Button>
              ) : (
                <Button
                  className="text-sm"
                  disabled={isPending}
                  onClick={() => handleChangeOrigin('diet_specific')}
                >
                  {dietTypeName ? `${dietTypeName} (dit dieet)` : 'Dit dieet'}
                </Button>
              )}
              {category.is_diet_specific ? (
                <Button
                  className="text-sm"
                  outline
                  disabled={isPending}
                  onClick={() => handleChangeOrigin('general')}
                >
                  Algemeen
                </Button>
              ) : (
                <Button
                  className="text-sm"
                  disabled={isPending}
                  onClick={() => handleChangeOrigin('general')}
                >
                  Algemeen
                </Button>
              )}
            </div>
            {originError && (
              <div className="mt-1 rounded-lg bg-red-50 p-2 text-xs text-red-600 dark:bg-red-950/50 dark:text-red-400">
                {originError}
              </div>
            )}
          </div>
        )}

        {/* Ingrediënten toevoegen */}
        <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Ingrediënten toevoegen
          </Text>

          <div className="flex gap-2">
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
              className="flex-1"
            />
            <Button
              onClick={handleAddTag}
              disabled={isPending || isGeneratingAI || !newTagInput.trim()}
            >
              <PlusIcon className="h-4 w-4" />
              Toevoegen
            </Button>
            <Button
              onClick={() => handleAIGenerateIngredients(false)}
              disabled={isGeneratingAI || isPending}
              color="zinc"
            >
              {isGeneratingAI ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
              {isGeneratingAI
                ? 'AI zoekt ingrediënten...'
                : 'AI: Vind ingrediënten'}
            </Button>
          </div>

          {/* AI Suggestions */}
          {aiSuggestions.length > 0 && (
            <div className="space-y-2">
              <Text className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                AI Suggesties ({selectedSuggestions.size} geselecteerd):
              </Text>
              <div className="flex flex-wrap gap-2">
                {aiSuggestions.map((suggestion) => {
                  const isSelected = selectedSuggestions.has(suggestion.term);
                  return (
                    <Badge
                      key={suggestion.term}
                      color={isSelected ? 'blue' : 'zinc'}
                      className="cursor-pointer text-xs"
                      onClick={() => handleToggleSuggestion(suggestion.term)}
                    >
                      {suggestion.term}
                      {suggestion.termNl &&
                        suggestion.termNl !== suggestion.term && (
                          <span className="ml-1 opacity-75">
                            ({suggestion.termNl})
                          </span>
                        )}
                      {suggestion.synonyms.length > 0 && (
                        <span className="ml-1 opacity-60">
                          +{suggestion.synonyms.length} syn.
                        </span>
                      )}
                    </Badge>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
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
                {aiSuggestions.length > 0 && (
                  <Button
                    onClick={handleAddAllSuggestions}
                    disabled={isPending}
                    className="text-sm"
                    color="blue"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Alles toevoegen ({aiSuggestions.length})
                  </Button>
                )}
                <Button
                  onClick={() => handleAIGenerateIngredients(true)}
                  disabled={isGeneratingAI || isPending}
                  className="text-sm text-zinc-600 dark:text-zinc-400"
                  plain
                >
                  <SparklesIcon className="h-3 w-3" />
                  Meer suggesties
                </Button>
              </div>
            </div>
          )}

          {/* Error/Success Messages */}
          {addError && (
            <div className="rounded-lg bg-red-50 p-2 text-xs text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {addError}
            </div>
          )}
          {addSuccess && (
            <div className="rounded-lg bg-green-50 p-2 text-xs text-green-600 dark:bg-green-950/50 dark:text-green-400">
              {addSuccess}
            </div>
          )}
        </div>

        {/* Category Info */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Totaal items:
            </Text>
            <Text className="text-sm text-zinc-600 dark:text-zinc-400">
              {totalCount}
            </Text>
          </div>
        </div>

        {/* Ingrediënten (platte lijst) */}
        <div className="mt-4 space-y-4">
          <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Ingrediënten ({filteredItems.length})
          </Text>

          {isLoadingItems ? (
            <div className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Laden...
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap gap-2">
                {filteredItems.map((item) =>
                  editingItem?.id === item.id ? (
                    <div
                      key={item.id}
                      className="w-full space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50"
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
                          placeholder={'spaghetti\npenne\nfusilli'}
                          disabled={isPending}
                          rows={4}
                          className="mt-1"
                        />
                      </Field>
                      {itemEditError && (
                        <div className="rounded-lg bg-red-50 p-2 text-xs text-red-600 dark:bg-red-950/50 dark:text-red-400">
                          {itemEditError}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          className="text-sm"
                          onClick={handleSaveItemEdit}
                          disabled={isPending}
                        >
                          Opslaan
                        </Button>
                        <Button
                          className="text-sm"
                          outline
                          onClick={handleCancelItemEdit}
                          disabled={isPending}
                        >
                          Annuleren
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Badge
                      key={item.id}
                      color="zinc"
                      className="group relative text-xs"
                    >
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOpenItemEdit(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpenItemEdit(item);
                          }
                        }}
                        className="cursor-pointer rounded pr-0.5"
                        title="Klik om Nederlandse naam en synoniemen te bewerken"
                      >
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
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        ×
                      </button>
                    </Badge>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Geen items in deze categorie
            </div>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button onClick={onClose} color="zinc">
          Sluiten
        </Button>
      </DialogActions>
    </Dialog>
  );
}
