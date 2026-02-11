'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  getIngredientCategoriesAction,
  getDietCategoryConstraintsAction,
  upsertDietCategoryConstraintsAction,
  createIngredientCategoryAction,
  updateIngredientCategoryAction,
  deleteIngredientCategoryAction,
  getIngredientCategoryItemsAction,
  createIngredientCategoryItemAction,
  updateIngredientCategoryItemAction,
  deleteIngredientCategoryItemAction,
} from '../actions/ingredient-categories-admin.actions';
import { Button } from '@/components/catalyst/button';
import { Checkbox, CheckboxField } from '@/components/catalyst/checkbox';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { Input } from '@/components/catalyst/input';
import { Textarea } from '@/components/catalyst/textarea';
import { Badge } from '@/components/catalyst/badge';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/20/solid';

type GuardRailsManagerProps = {
  dietTypeId: string;
  dietTypeName: string;
  onSaved?: () => void;
};

type Category = {
  id: string;
  code: string;
  name_nl: string;
  name_en: string | null;
  description: string | null;
  category_type: 'forbidden' | 'required';
  display_order: number;
  is_active: boolean;
  items_count?: number;
};

type Constraint = {
  id: string;
  category_id: string;
  category_code: string;
  category_name_nl: string;
  category_type: 'forbidden' | 'required';
  constraint_type: 'forbidden' | 'required';
  rule_action: 'allow' | 'block';
  strictness: 'hard' | 'soft';
  min_per_day: number | null;
  min_per_week: number | null;
  priority: number;
  rule_priority: number;
  is_active: boolean;
};

type CategoryItem = {
  id: string;
  category_id: string;
  term: string;
  term_nl: string | null;
  synonyms: string[];
  display_order: number;
  is_active: boolean;
};

export function GuardRailsManager({
  dietTypeId,
  dietTypeName,
  onSaved,
}: GuardRailsManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [_constraints, setConstraints] = useState<Constraint[]>([]);
  // Firewall rules: track allow/block per category (kan beide hebben)
  const [selectedAllow, setSelectedAllow] = useState<Set<string>>(new Set());
  const [selectedBlock, setSelectedBlock] = useState<Set<string>>(new Set());
  // Legacy support: selectedForbidden/selectedRequired voor backward compatibility
  const [selectedForbidden, setSelectedForbidden] = useState<Set<string>>(
    new Set(),
  );
  const [selectedRequired, setSelectedRequired] = useState<Set<string>>(
    new Set(),
  );
  const [constraintDetails, setConstraintDetails] = useState<
    Record<
      string,
      {
        rule_action?: 'allow' | 'block';
        strictness: 'hard' | 'soft';
        min_per_day?: number | null;
        min_per_week?: number | null;
        priority: number;
        rule_priority: number;
      }
    >
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Category management state
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [showDeleteCategoryDialog, setShowDeleteCategoryDialog] =
    useState(false);
  const [_deleteConstraintId, _setDeleteConstraintId] = useState<string | null>(
    null,
  );
  const [_showDeleteConstraintDialog, _setShowDeleteConstraintDialog] =
    useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [categoryItems, setCategoryItems] = useState<
    Record<string, CategoryItem[]>
  >({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [creatingItemForCategory, setCreatingItemForCategory] = useState<
    string | null
  >(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [showDeleteItemDialog, setShowDeleteItemDialog] = useState(false);

  // Category form state
  const [categoryFormData, setCategoryFormData] = useState({
    code: '',
    name_nl: '',
    name_en: '',
    description: '',
    category_type: 'forbidden' as 'forbidden' | 'required',
    display_order: 0,
  });

  // Item form state
  const [itemFormData, setItemFormData] = useState({
    term: '',
    term_nl: '',
    synonyms: [] as string[],
    display_order: 0,
  });

  useEffect(() => {
    loadData();
  }, [dietTypeId]);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [categoriesResult, constraintsResult] = await Promise.all([
        getIngredientCategoriesAction(),
        getDietCategoryConstraintsAction(dietTypeId),
      ]);

      if (!categoriesResult.ok) {
        setError(categoriesResult.error.message);
        return;
      }

      if (!constraintsResult.ok) {
        setError(constraintsResult.error.message);
        return;
      }

      setCategories(categoriesResult.data || []);
      setConstraints(constraintsResult.data || []);

      // Initialize selected sets from constraints (firewall rules)
      const allowSet = new Set<string>();
      const blockSet = new Set<string>();
      // Legacy support
      const forbiddenSet = new Set<string>();
      const requiredSet = new Set<string>();
      const details: typeof constraintDetails = {};

      type ConstraintRow = {
        category_id: string;
        rule_action?: 'allow' | 'block';
        constraint_type?: 'forbidden' | 'required';
        strictness: 'hard' | 'soft';
        min_per_day?: number | null;
        min_per_week?: number | null;
        priority: number;
        rule_priority: number;
      };
      (constraintsResult.data || []).forEach((constraint: ConstraintRow) => {
        const ruleAction =
          constraint.rule_action ||
          (constraint.constraint_type === 'forbidden' ? 'block' : 'allow');

        if (ruleAction === 'block') {
          blockSet.add(constraint.category_id);
          forbiddenSet.add(constraint.category_id); // Legacy
        } else if (ruleAction === 'allow') {
          allowSet.add(constraint.category_id);
          requiredSet.add(constraint.category_id); // Legacy
        }

        // Store details per category (laatste constraint wint als er meerdere zijn)
        details[constraint.category_id] = {
          rule_action: ruleAction,
          strictness: constraint.strictness,
          min_per_day: constraint.min_per_day,
          min_per_week: constraint.min_per_week,
          priority: constraint.priority,
          rule_priority: constraint.rule_priority ?? constraint.priority ?? 50,
        };
      });

      setSelectedAllow(allowSet);
      setSelectedBlock(blockSet);
      setSelectedForbidden(forbiddenSet); // Legacy
      setSelectedRequired(requiredSet); // Legacy
      setConstraintDetails(details);
    } catch (_err) {
      setError('Onverwachte fout bij laden data');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCategoryItems(categoryId: string) {
    const result = await getIngredientCategoryItemsAction(categoryId);
    if (result.ok && result.data) {
      setCategoryItems((prev) => ({
        ...prev,
        [categoryId]: result.data || [],
      }));
    }
  }

  function toggleCategoryExpanded(categoryId: string) {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
      // Load items if not already loaded
      if (!categoryItems[categoryId]) {
        loadCategoryItems(categoryId);
      }
    }
    setExpandedCategories(newExpanded);
  }

  function _handleForbiddenToggle(categoryId: string, checked: boolean) {
    const newSet = new Set(selectedForbidden);
    if (checked) {
      newSet.add(categoryId);
      if (!constraintDetails[categoryId]) {
        setConstraintDetails({
          ...constraintDetails,
          [categoryId]: {
            strictness: 'hard',
            priority: 90,
            rule_priority: 90,
          },
        });
      }
      const newRequired = new Set(selectedRequired);
      newRequired.delete(categoryId);
      setSelectedRequired(newRequired);
    } else {
      newSet.delete(categoryId);
      const newDetails = { ...constraintDetails };
      delete newDetails[categoryId];
      setConstraintDetails(newDetails);
    }
    setSelectedForbidden(newSet);
  }

  function _handleRequiredToggle(categoryId: string, checked: boolean) {
    const newSet = new Set(selectedRequired);
    if (checked) {
      newSet.add(categoryId);
      if (!constraintDetails[categoryId]) {
        setConstraintDetails({
          ...constraintDetails,
          [categoryId]: {
            strictness: 'hard',
            min_per_week: 2,
            priority: 80,
            rule_priority: 80,
          },
        });
      }
      const newForbidden = new Set(selectedForbidden);
      newForbidden.delete(categoryId);
      setSelectedForbidden(newForbidden);
    } else {
      newSet.delete(categoryId);
      const newDetails = { ...constraintDetails };
      delete newDetails[categoryId];
      setConstraintDetails(newDetails);
    }
    setSelectedRequired(newSet);
  }

  function updateConstraintDetail(
    categoryId: string,
    field: keyof (typeof constraintDetails)[string],
    value: string | number | null | undefined,
  ) {
    setConstraintDetails({
      ...constraintDetails,
      [categoryId]: {
        ...constraintDetails[categoryId],
        [field]: value,
      },
    });
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    startTransition(async () => {
      try {
        const constraintsToSave: Array<{
          category_id: string;
          constraint_type?: 'forbidden' | 'required'; // Legacy
          rule_action?: 'allow' | 'block';
          strictness?: 'hard' | 'soft';
          min_per_day?: number | null;
          min_per_week?: number | null;
          priority?: number;
          rule_priority?: number;
          is_active?: boolean;
        }> = [];

        // Firewall rules: allow
        selectedAllow.forEach((categoryId) => {
          const details = constraintDetails[categoryId] || {
            strictness: 'hard' as const,
            priority: 80,
            rule_priority: 80,
          };
          constraintsToSave.push({
            category_id: categoryId,
            constraint_type: 'required', // Legacy
            rule_action: 'allow',
            strictness: details.strictness,
            min_per_day: details.min_per_day ?? null,
            min_per_week: details.min_per_week ?? null,
            priority: details.priority,
            rule_priority: details.rule_priority ?? details.priority ?? 80,
            is_active: true,
          });
        });

        // Firewall rules: block
        selectedBlock.forEach((categoryId) => {
          const details = constraintDetails[categoryId] || {
            strictness: 'hard' as const,
            priority: 90,
            rule_priority: 90,
          };
          constraintsToSave.push({
            category_id: categoryId,
            constraint_type: 'forbidden', // Legacy
            rule_action: 'block',
            strictness: details.strictness,
            priority: details.priority,
            rule_priority: details.rule_priority ?? details.priority ?? 90,
            is_active: true,
          });
        });

        const result = await upsertDietCategoryConstraintsAction(
          dietTypeId,
          constraintsToSave,
        );

        if (!result.ok) {
          setError(result.error.message);
        } else {
          setSuccess('Dieetregels succesvol opgeslagen');
          await loadData();
          // Callback to notify parent (e.g., to switch back to overview)
          if (onSaved) {
            onSaved();
          }
        }
      } catch (_err) {
        setError('Onverwachte fout bij opslaan');
      } finally {
        setIsSaving(false);
      }
    });
  }

  async function handleSaveCategory() {
    setError(null);
    setSuccess(null);

    if (!categoryFormData.code.trim() || !categoryFormData.name_nl.trim()) {
      setError('Code en Nederlandse naam zijn verplicht');
      return;
    }

    startTransition(async () => {
      try {
        let result;
        if (isCreatingCategory) {
          result = await createIngredientCategoryAction({
            code: categoryFormData.code.trim().toLowerCase(),
            name_nl: categoryFormData.name_nl.trim(),
            name_en: categoryFormData.name_en.trim() || null,
            description: categoryFormData.description.trim() || null,
            category_type: categoryFormData.category_type,
            display_order: categoryFormData.display_order,
          });
        } else if (editingCategoryId) {
          result = await updateIngredientCategoryAction(editingCategoryId, {
            name_nl: categoryFormData.name_nl.trim(),
            name_en: categoryFormData.name_en.trim() || null,
            description: categoryFormData.description.trim() || null,
            display_order: categoryFormData.display_order,
          });
        }

        if (!result || !result.ok) {
          setError(result?.error.message || 'Fout bij opslaan');
        } else {
          setSuccess(
            isCreatingCategory
              ? 'Categorie succesvol aangemaakt'
              : 'Categorie succesvol bijgewerkt',
          );
          setIsCreatingCategory(false);
          setEditingCategoryId(null);
          await loadData();
        }
      } catch (_err) {
        setError('Onverwachte fout bij opslaan');
      }
    });
  }

  async function handleSaveItem(categoryId: string) {
    setError(null);
    setSuccess(null);

    if (!itemFormData.term.trim()) {
      setError('Term is verplicht');
      return;
    }

    startTransition(async () => {
      try {
        let result;
        if (creatingItemForCategory) {
          result = await createIngredientCategoryItemAction({
            category_id: categoryId,
            term: itemFormData.term.trim(),
            term_nl: itemFormData.term_nl.trim() || null,
            synonyms: itemFormData.synonyms.filter((s) => s.trim()),
            display_order: itemFormData.display_order,
          });
        } else if (editingItemId) {
          result = await updateIngredientCategoryItemAction(editingItemId, {
            term: itemFormData.term.trim(),
            term_nl: itemFormData.term_nl.trim() || null,
            synonyms: itemFormData.synonyms.filter((s) => s.trim()),
            display_order: itemFormData.display_order,
          });
        }

        if (!result || !result.ok) {
          setError(result?.error.message || 'Fout bij opslaan');
        } else {
          setSuccess(
            creatingItemForCategory
              ? 'Ingrediënt succesvol toegevoegd'
              : 'Ingrediënt succesvol bijgewerkt',
          );
          setCreatingItemForCategory(null);
          setEditingItemId(null);
          setItemFormData({
            term: '',
            term_nl: '',
            synonyms: [],
            display_order: 0,
          });
          await loadCategoryItems(categoryId);
          await loadData(); // Refresh counts
        }
      } catch (_err) {
        setError('Onverwachte fout bij opslaan');
      }
    });
  }

  const forbiddenCategories = categories.filter(
    (c) => c.category_type === 'forbidden' && c.is_active,
  );
  const requiredCategories = categories.filter(
    (c) => c.category_type === 'required' && c.is_active,
  );
  const allCategories = [...forbiddenCategories, ...requiredCategories].sort(
    (a, b) => a.display_order - b.display_order,
  );

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Text>Guard rails laden...</Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Dieetregels voor {dietTypeName}
            </h2>
            <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Beheer categorieën, configureer allow/block regels met prioriteit.
              Regels worden geëvalueerd in volgorde van prioriteit (eerste match
              wint).
            </Text>
          </div>
          <Button
            onClick={() => {
              setIsCreatingCategory(true);
              setEditingCategoryId(null);
              setCategoryFormData({
                code: '',
                name_nl: '',
                name_en: '',
                description: '',
                category_type: 'forbidden',
                display_order: categories.length + 1,
              });
            }}
            disabled={isCreatingCategory || editingCategoryId !== null}
          >
            <PlusIcon className="h-4 w-4" />
            Nieuwe Categorie
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            <strong>Fout:</strong> {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
            <strong>Succes:</strong> {success}
          </div>
        )}

        {/* Create/Edit Category Form */}
        {(isCreatingCategory || editingCategoryId) && (
          <div className="mb-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="mb-3 text-base font-medium text-zinc-950 dark:text-white">
              {isCreatingCategory ? 'Nieuwe Categorie' : 'Categorie Bewerken'}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveCategory();
              }}
              className="space-y-4"
            >
              <FieldGroup>
                <Field>
                  <Label htmlFor="category-code">Code *</Label>
                  <Input
                    id="category-code"
                    value={categoryFormData.code}
                    onChange={(e) =>
                      setCategoryFormData({
                        ...categoryFormData,
                        code: e.target.value,
                      })
                    }
                    required
                    disabled={!!editingCategoryId}
                    placeholder="Bijv. dairy, gluten_containing_grains"
                  />
                  <Description>
                    Unieke identifier (kleine letters, underscores). Kan niet
                    worden gewijzigd na aanmaken.
                  </Description>
                </Field>

                <Field>
                  <Label htmlFor="category-name-nl">Nederlandse Naam *</Label>
                  <Input
                    id="category-name-nl"
                    value={categoryFormData.name_nl}
                    onChange={(e) =>
                      setCategoryFormData({
                        ...categoryFormData,
                        name_nl: e.target.value,
                      })
                    }
                    required
                    placeholder="Bijv. Zuivel, Glutenhoudende granen"
                  />
                </Field>

                <Field>
                  <Label htmlFor="category-name-en">Engelse Naam</Label>
                  <Input
                    id="category-name-en"
                    value={categoryFormData.name_en}
                    onChange={(e) =>
                      setCategoryFormData({
                        ...categoryFormData,
                        name_en: e.target.value,
                      })
                    }
                    placeholder="Bijv. Dairy, Gluten-containing grains"
                  />
                </Field>

                <Field>
                  <Label htmlFor="category-description">Beschrijving</Label>
                  <Textarea
                    id="category-description"
                    value={categoryFormData.description}
                    onChange={(e) =>
                      setCategoryFormData({
                        ...categoryFormData,
                        description: e.target.value,
                      })
                    }
                    rows={2}
                    placeholder="Beschrijving van de categorie..."
                  />
                </Field>

                <Field>
                  <Label htmlFor="category-type">Type *</Label>
                  <select
                    id="category-type"
                    value={categoryFormData.category_type}
                    onChange={(e) =>
                      setCategoryFormData({
                        ...categoryFormData,
                        category_type: e.target.value as
                          | 'forbidden'
                          | 'required',
                      })
                    }
                    required
                    disabled={!!editingCategoryId}
                    className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="forbidden">Verboden</option>
                    <option value="required">Vereist</option>
                  </select>
                  <Description>
                    Type kan niet worden gewijzigd na aanmaken.
                  </Description>
                </Field>

                <Field>
                  <Label htmlFor="category-display-order">
                    Weergave Volgorde
                  </Label>
                  <Input
                    id="category-display-order"
                    type="number"
                    min={0}
                    value={categoryFormData.display_order}
                    onChange={(e) =>
                      setCategoryFormData({
                        ...categoryFormData,
                        display_order: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <Description>
                    Lagere nummers verschijnen eerst in de lijst.
                  </Description>
                </Field>

                <div className="flex gap-2">
                  <Button type="submit" disabled={isPending}>
                    {isPending
                      ? 'Opslaan...'
                      : isCreatingCategory
                        ? 'Aanmaken'
                        : 'Bijwerken'}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setIsCreatingCategory(false);
                      setEditingCategoryId(null);
                      setError(null);
                      setSuccess(null);
                    }}
                    color="zinc"
                  >
                    Annuleren
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </div>
        )}

        {/* Categories List */}
        <div className="space-y-3">
          {allCategories.map((category) => {
            // Firewall rules: check allow/block
            const isAllow = selectedAllow.has(category.id);
            const isBlock = selectedBlock.has(category.id);
            const isSelected = isAllow || isBlock;
            const details = constraintDetails[category.id];
            const isExpanded = expandedCategories.has(category.id);
            const items = categoryItems[category.id] || [];

            return (
              <div
                key={category.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex items-start gap-3">
                  {/* Regel Acties: Allow/Block */}
                  <div className="flex flex-col gap-2">
                    <CheckboxField>
                      <Checkbox
                        checked={isAllow}
                        onChange={(checked) => {
                          const newAllow = new Set(selectedAllow);
                          if (checked) {
                            newAllow.add(category.id);
                            if (!constraintDetails[category.id]) {
                              setConstraintDetails({
                                ...constraintDetails,
                                [category.id]: {
                                  rule_action: 'allow',
                                  strictness: 'hard',
                                  priority: 80,
                                  rule_priority: 80,
                                },
                              });
                            }
                          } else {
                            newAllow.delete(category.id);
                          }
                          setSelectedAllow(newAllow);
                        }}
                      />
                      <Label className="text-xs text-green-600 dark:text-green-400">
                        Allow
                      </Label>
                    </CheckboxField>
                    <CheckboxField>
                      <Checkbox
                        checked={isBlock}
                        onChange={(checked) => {
                          const newBlock = new Set(selectedBlock);
                          if (checked) {
                            newBlock.add(category.id);
                            if (!constraintDetails[category.id]) {
                              setConstraintDetails({
                                ...constraintDetails,
                                [category.id]: {
                                  rule_action: 'block',
                                  strictness: 'hard',
                                  priority: 90,
                                  rule_priority: 90,
                                },
                              });
                            }
                          } else {
                            newBlock.delete(category.id);
                          }
                          setSelectedBlock(newBlock);
                        }}
                      />
                      <Label className="text-xs text-red-600 dark:text-red-400">
                        Block
                      </Label>
                    </CheckboxField>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Text className="font-medium text-zinc-950 dark:text-white">
                        {category.name_nl}
                      </Text>
                      <Badge
                        color={
                          category.category_type === 'forbidden'
                            ? 'red'
                            : 'green'
                        }
                      >
                        {category.category_type === 'forbidden'
                          ? 'Verboden'
                          : 'Vereist'}
                      </Badge>
                      {category.items_count !== undefined &&
                        category.items_count > 0 && (
                          <Badge color="zinc">
                            {category.items_count} ingrediënten
                          </Badge>
                        )}
                    </div>
                    {category.description && (
                      <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {category.description}
                      </Text>
                    )}

                    {/* Constraint Details (when selected) */}
                    {isSelected && (
                      <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                        <Field>
                          <Label htmlFor={`rule-action-${category.id}`}>
                            Rule Actie
                          </Label>
                          <select
                            id={`rule-action-${category.id}`}
                            value={
                              details?.rule_action ||
                              (isBlock ? 'block' : 'allow')
                            }
                            onChange={(e) =>
                              updateConstraintDetail(
                                category.id,
                                'rule_action',
                                e.target.value as 'allow' | 'block',
                              )
                            }
                            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                          >
                            <option value="allow">Allow (Toestaan)</option>
                            <option value="block">Block (Blokkeren)</option>
                          </select>
                          <Description>
                            Regel actie. Block heeft voorrang over allow bij
                            gelijke prioriteit.
                          </Description>
                        </Field>
                        <Field>
                          <Label htmlFor={`strictness-${category.id}`}>
                            Striktheid
                          </Label>
                          <select
                            id={`strictness-${category.id}`}
                            value={details?.strictness || 'hard'}
                            onChange={(e) =>
                              updateConstraintDetail(
                                category.id,
                                'strictness',
                                e.target.value as 'hard' | 'soft',
                              )
                            }
                            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                          >
                            <option value="hard">Hard</option>
                            <option value="soft">Soft</option>
                          </select>
                        </Field>
                        {(isAllow || category.category_type === 'required') && (
                          <div className="grid grid-cols-2 gap-2">
                            <Field>
                              <Label htmlFor={`min-per-day-${category.id}`}>
                                Min. per dag
                              </Label>
                              <Input
                                id={`min-per-day-${category.id}`}
                                type="number"
                                min={0}
                                value={details?.min_per_day || ''}
                                onChange={(e) =>
                                  updateConstraintDetail(
                                    category.id,
                                    'min_per_day',
                                    e.target.value
                                      ? parseInt(e.target.value)
                                      : null,
                                  )
                                }
                                placeholder="0"
                              />
                            </Field>
                            <Field>
                              <Label htmlFor={`min-per-week-${category.id}`}>
                                Min. per week
                              </Label>
                              <Input
                                id={`min-per-week-${category.id}`}
                                type="number"
                                min={0}
                                value={details?.min_per_week || ''}
                                onChange={(e) =>
                                  updateConstraintDetail(
                                    category.id,
                                    'min_per_week',
                                    e.target.value
                                      ? parseInt(e.target.value)
                                      : null,
                                  )
                                }
                                placeholder="0"
                              />
                            </Field>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <Field>
                            <Label htmlFor={`priority-${category.id}`}>
                              Prioriteit (Legacy)
                            </Label>
                            <Input
                              id={`priority-${category.id}`}
                              type="number"
                              min={0}
                              max={100}
                              value={details?.priority || (isBlock ? 90 : 80)}
                              onChange={(e) =>
                                updateConstraintDetail(
                                  category.id,
                                  'priority',
                                  parseInt(e.target.value) ||
                                    (isBlock ? 90 : 80),
                                )
                              }
                            />
                          </Field>
                          <Field>
                            <Label htmlFor={`rule-priority-${category.id}`}>
                              Rule Prioriteit *
                            </Label>
                            <Input
                              id={`rule-priority-${category.id}`}
                              type="number"
                              min={0}
                              max={100}
                              value={
                                details?.rule_priority ??
                                details?.priority ??
                                (isBlock ? 90 : 80)
                              }
                              onChange={(e) =>
                                updateConstraintDetail(
                                  category.id,
                                  'rule_priority',
                                  parseInt(e.target.value) ||
                                    (isBlock ? 90 : 80),
                                )
                              }
                            />
                            <Description>
                              Evaluatie prioriteit (0-100, hoger =
                              belangrijker). Regels worden geëvalueerd in
                              volgorde van prioriteit.
                            </Description>
                          </Field>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => toggleCategoryExpanded(category.id)}
                      color="zinc"
                    >
                      {isExpanded ? (
                        <ChevronUpIcon className="h-4 w-4" />
                      ) : (
                        <ChevronDownIcon className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      onClick={() => {
                        setEditingCategoryId(category.id);
                        setIsCreatingCategory(false);
                        setCategoryFormData({
                          code: category.code,
                          name_nl: category.name_nl,
                          name_en: category.name_en || '',
                          description: category.description || '',
                          category_type: category.category_type,
                          display_order: category.display_order,
                        });
                      }}
                      color="zinc"
                      disabled={
                        isCreatingCategory || editingCategoryId === category.id
                      }
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => {
                        setDeleteCategoryId(category.id);
                        setShowDeleteCategoryDialog(true);
                      }}
                      color="red"
                      disabled={isPending}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded: Items/Synonyms */}
                {isExpanded && (
                  <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-medium text-zinc-950 dark:text-white">
                        Ingrediënten & Synoniemen
                      </h4>
                      <Button
                        onClick={() => {
                          setCreatingItemForCategory(category.id);
                          setEditingItemId(null);
                          setItemFormData({
                            term: '',
                            term_nl: '',
                            synonyms: [],
                            display_order: items.length + 1,
                          });
                        }}
                        disabled={
                          creatingItemForCategory === category.id ||
                          editingItemId !== null
                        }
                      >
                        <PlusIcon className="h-4 w-4" />
                        Toevoegen
                      </Button>
                    </div>

                    {/* Create/Edit Item Form */}
                    {(creatingItemForCategory === category.id ||
                      editingItemId) && (
                      <div className="mb-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                        <h5 className="mb-3 text-sm font-medium text-zinc-950 dark:text-white">
                          {creatingItemForCategory === category.id
                            ? 'Nieuw Ingrediënt'
                            : 'Ingrediënt Bewerken'}
                        </h5>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSaveItem(category.id);
                          }}
                          className="space-y-3"
                        >
                          <FieldGroup>
                            <Field>
                              <Label htmlFor="item-term">Term *</Label>
                              <Input
                                id="item-term"
                                value={itemFormData.term}
                                onChange={(e) =>
                                  setItemFormData({
                                    ...itemFormData,
                                    term: e.target.value,
                                  })
                                }
                                required
                                placeholder="Bijv. pasta, orzo"
                              />
                            </Field>

                            <Field>
                              <Label htmlFor="item-term-nl">
                                Nederlandse Term
                              </Label>
                              <Input
                                id="item-term-nl"
                                value={itemFormData.term_nl}
                                onChange={(e) =>
                                  setItemFormData({
                                    ...itemFormData,
                                    term_nl: e.target.value,
                                  })
                                }
                                placeholder="Bijv. pasta, orzo"
                              />
                            </Field>

                            <Field>
                              <Label htmlFor="item-synonyms">
                                Synoniemen (één per regel)
                              </Label>
                              <Textarea
                                id="item-synonyms"
                                value={itemFormData.synonyms.join('\n')}
                                onChange={(e) =>
                                  setItemFormData({
                                    ...itemFormData,
                                    synonyms: e.target.value
                                      .split('\n')
                                      .map((s) => s.trim())
                                      .filter((s) => s),
                                  })
                                }
                                rows={3}
                                placeholder="spaghetti&#10;penne&#10;fusilli"
                              />
                              <Description>
                                Elke regel is een synoniem. Bijv. voor
                                &quot;pasta&quot;: spaghetti, penne, fusilli,
                                etc.
                              </Description>
                            </Field>

                            <Field>
                              <Label htmlFor="item-display-order">
                                Weergave Volgorde
                              </Label>
                              <Input
                                id="item-display-order"
                                type="number"
                                min={0}
                                value={itemFormData.display_order}
                                onChange={(e) =>
                                  setItemFormData({
                                    ...itemFormData,
                                    display_order:
                                      parseInt(e.target.value) || 0,
                                  })
                                }
                              />
                            </Field>

                            <div className="flex gap-2">
                              <Button type="submit" disabled={isPending}>
                                {isPending
                                  ? 'Opslaan...'
                                  : creatingItemForCategory === category.id
                                    ? 'Toevoegen'
                                    : 'Bijwerken'}
                              </Button>
                              <Button
                                type="button"
                                onClick={() => {
                                  setCreatingItemForCategory(null);
                                  setEditingItemId(null);
                                  setItemFormData({
                                    term: '',
                                    term_nl: '',
                                    synonyms: [],
                                    display_order: 0,
                                  });
                                }}
                                color="zinc"
                              >
                                Annuleren
                              </Button>
                            </div>
                          </FieldGroup>
                        </form>
                      </div>
                    )}

                    {/* Items List */}
                    <div className="space-y-2">
                      {items.length === 0 ? (
                        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                          Geen ingrediënten toegevoegd. Klik op
                          &quot;Toevoegen&quot; om te beginnen.
                        </Text>
                      ) : (
                        items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Text className="font-medium text-zinc-950 dark:text-white">
                                  {item.term}
                                </Text>
                                {item.term_nl && (
                                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                                    ({item.term_nl})
                                  </Text>
                                )}
                              </div>
                              {item.synonyms.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {item.synonyms.map((synonym, idx) => (
                                    <Badge key={idx} color="zinc">
                                      {synonym}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => {
                                  setEditingItemId(item.id);
                                  setCreatingItemForCategory(null);
                                  setItemFormData({
                                    term: item.term,
                                    term_nl: item.term_nl || '',
                                    synonyms: item.synonyms,
                                    display_order: item.display_order,
                                  });
                                }}
                                color="zinc"
                                disabled={
                                  creatingItemForCategory === category.id ||
                                  editingItemId === item.id
                                }
                              >
                                <PencilIcon className="h-4 w-4" />
                              </Button>
                              <Button
                                onClick={() => {
                                  setDeleteItemId(item.id);
                                  setShowDeleteItemDialog(true);
                                }}
                                color="red"
                                disabled={isPending}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={isPending || isSaving}>
            {isPending || isSaving ? 'Opslaan...' : 'Dieetregels Opslaan'}
          </Button>
        </div>
      </div>

      {/* Delete Category Dialog */}
      <ConfirmDialog
        open={showDeleteCategoryDialog}
        onClose={() => {
          setShowDeleteCategoryDialog(false);
          setDeleteCategoryId(null);
        }}
        onConfirm={async () => {
          if (!deleteCategoryId) return;
          setShowDeleteCategoryDialog(false);
          setError(null);
          setSuccess(null);

          startTransition(async () => {
            try {
              const result =
                await deleteIngredientCategoryAction(deleteCategoryId);
              if (!result.ok) {
                setError(result.error.message);
              } else {
                setSuccess('Categorie succesvol verwijderd');
                await loadData();
              }
            } catch (_err) {
              setError('Onverwachte fout bij verwijderen');
            } finally {
              setDeleteCategoryId(null);
            }
          });
        }}
        title="Categorie verwijderen"
        description="Weet je zeker dat je deze categorie wilt verwijderen? Dit zal de categorie deactiveren (soft delete)."
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isPending}
      />

      {/* Delete Item Dialog */}
      <ConfirmDialog
        open={showDeleteItemDialog}
        onClose={() => {
          setShowDeleteItemDialog(false);
          setDeleteItemId(null);
        }}
        onConfirm={async () => {
          if (!deleteItemId) return;
          setShowDeleteItemDialog(false);
          setError(null);
          setSuccess(null);

          startTransition(async () => {
            try {
              const result =
                await deleteIngredientCategoryItemAction(deleteItemId);
              if (!result.ok) {
                setError(result.error.message);
              } else {
                setSuccess('Ingrediënt succesvol verwijderd');
                // Find which category this item belongs to
                const itemCategoryId = Object.keys(categoryItems).find(
                  (catId) =>
                    categoryItems[catId].some(
                      (item) => item.id === deleteItemId,
                    ),
                );
                if (itemCategoryId) {
                  await loadCategoryItems(itemCategoryId);
                  await loadData();
                }
              }
            } catch (_err) {
              setError('Onverwachte fout bij verwijderen');
            } finally {
              setDeleteItemId(null);
            }
          });
        }}
        title="Ingrediënt verwijderen"
        description="Weet je zeker dat je dit ingrediënt wilt verwijderen?"
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isPending}
      />
    </div>
  );
}
