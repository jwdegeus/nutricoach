'use client';

import {
  useState,
  useEffect,
  useCallback,
  Fragment,
  useRef,
  useMemo,
} from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/catalyst/badge';
import { Text } from '@/components/catalyst/text';
import { Button } from '@/components/catalyst/button';
import {
  StarIcon,
  SparklesIcon,
  LinkIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LightBulbIcon,
} from '@heroicons/react/20/solid';
import { PencilIcon } from '@heroicons/react/16/solid';
import { RecipeNotesEditor } from './RecipeNotesEditor';
import { ImageLightbox } from './ImageLightbox';
import { RecipeImageUpload } from './RecipeImageUpload';
import { RecipeSourceEditor } from './RecipeSourceEditor';
import { RecipeEditableTag } from './RecipeEditableTag';
import { RecipeAIMagician } from './RecipeAIMagician';
import { RecipePrepTimeAndServingsEditor } from './RecipePrepTimeAndServingsEditor';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog';
import { Select } from '@/components/catalyst/select';
import { Field, Label } from '@/components/catalyst/fieldset';
import {
  RecipeContentEditor,
  getIngredientsForEditor,
  getInstructionsForEditor,
} from './RecipeContentEditor';
import { IngredientRowWithNutrition } from './IngredientRowWithNutrition';
import { RecipeNutritionKpi } from './RecipeNutritionKpi';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import {
  updateRecipeNotesAction,
  deleteMealAction,
  removeRecipeIngredientAction,
  updateRecipeContentAction,
} from '../../actions/meals.actions';
import {
  getRecipeNutritionSummaryAction,
  getResolvedIngredientMatchesAction,
  type RecipeNutritionSummary,
  type ResolvedIngredientMatch,
} from '../actions/ingredient-matching.actions';
import { quantityUnitToGrams } from '@/src/lib/recipes/quantity-unit-to-grams';
import {
  getHasAppliedAdaptationAction,
  removeRecipeAdaptationAction,
} from '../actions/recipe-ai.persist.actions';
import { useToast } from '@/src/components/app/ToastContext';

/** Ingrediënten die meestal "naar smaak" zijn; geen hoeveelheid tonen/meerekenen als niet bekend. */
const TO_TASTE_INGREDIENT_PATTERN =
  /^(zee-?)?zout|peper|(sea\s+)?salt|(black\s+)?pepper$/i;
function isToTasteIngredient(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  const firstWord = n.split(/\s+/)[0] ?? '';
  return (
    TO_TASTE_INGREDIENT_PATTERN.test(firstWord) ||
    TO_TASTE_INGREDIENT_PATTERN.test(n)
  );
}
import type { RecipeComplianceResult } from '../../actions/recipe-compliance.actions';

/** Legacy/display ingredient item (name, quantity, unit, etc.) */
type MealIngredientLike = {
  name?: string;
  original_line?: string;
  quantity?: string | number | null;
  amount?: string | number | null;
  unit?: string | null;
  note?: string | null;
  notes?: string | null;
  section?: string | null;
};

/** Instruction step: string or { text?, step? } */
type InstructionLike = string | { text?: string; step?: string };

/** Ingredient ref (nevo/custom/fndds) for display */
type IngredientRefLike = {
  displayName?: string;
  nevoCode?: string | number;
  customFoodId?: string;
  fdcId?: string | number;
  quantity?: number;
  unit?: string;
  quantityG?: number;
  quantity_g?: number;
};

/** Meal data (ingredients, refs, instructions, nutrition) – supports both camelCase and snake_case */
type MealDataLike = Record<string, unknown> & {
  ingredients?: MealIngredientLike[] | unknown[];
  ingredientRefs?: IngredientRefLike[] | unknown[];
  instructions?: InstructionLike[] | unknown[];
  prepTime?: string | number;
  servings?: string | number;
  estimatedMacros?: Record<string, unknown>;
  nutrition?: Record<string, unknown>;
};

/** Meal prop: supports both CustomMealRecord (camelCase) and API/DB (snake_case) */
type MealLike = Record<string, unknown> & {
  mealData?: unknown;
  meal_data?: unknown;
  name?: string;
  mealName?: string;
  meal_name?: string;
  mealSlot?: string;
  meal_slot?: string;
  sourceImageUrl?: string | null;
  source_image_url?: string | null;
  aiAnalysis?: unknown;
  ai_analysis?: unknown;
  consumptionCount?: number;
  consumption_count?: number;
  usageCount?: number;
  usage_count?: number;
  createdAt?: string;
  created_at?: string;
  firstConsumedAt?: string | null;
  first_consumed_at?: string | null;
  firstUsedAt?: string | null;
  first_used_at?: string | null;
  lastConsumedAt?: string | null;
  last_consumed_at?: string | null;
  lastUsedAt?: string | null;
  last_used_at?: string | null;
  userRating?: unknown;
  user_rating?: unknown;
  nutritionScore?: unknown;
  nutrition_score?: unknown;
  updatedAt?: string;
  updated_at?: string;
  meal_data_original?: unknown;
  ai_analysis_original?: unknown;
  diet_key?: string | null;
  source_url?: string | null;
  sourceUrl?: string | null;
};

type MealDetailProps = {
  meal: MealLike;
  mealSource: 'custom' | 'gemini';
  nevoFoodNamesByCode: Record<string, string>;
  /** Actuele namen uit ingredientendatabase (custom_foods) voor weergave na wijziging */
  customFoodNamesById?: Record<string, string>;
  /** Compliance score 0–100% volgens dieetregels */
  complianceScore?: RecipeComplianceResult | null;
  /** Wordt aangeroepen nadat AI Magician een aangepaste versie heeft toegepast, zodat de pagina kan verversen */
  onRecipeApplied?: () => void;
  /** Wordt aangeroepen na het koppelen van een ingrediënt (stille refresh + notificatie, geen volledige paginaload) */
  onIngredientMatched?: () => void;
  /** Wordt aangeroepen nadat de receptbron is opgeslagen, zodat meal-data wordt ververst en het label gelijk blijft */
  onSourceSaved?: () => void;
};

export function MealDetail({
  meal,
  mealSource,
  nevoFoodNamesByCode,
  customFoodNamesById = {},
  complianceScore,
  onRecipeApplied,
  onIngredientMatched,
  onSourceSaved,
}: MealDetailProps) {
  const { showToast } = useToast();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [aiMagicianOpen, setAiMagicianOpen] = useState(false);
  /** Toon originele versie (ingrediënten + bereiding) i.p.v. aangepaste */
  const [viewingOriginal, setViewingOriginal] = useState(false);
  const [isRemovingAdaptation, setIsRemovingAdaptation] = useState(false);
  const [removeAdaptationError, setRemoveAdaptationError] = useState<
    string | null
  >(null);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  /** Of er een toegepaste aanpassing bestaat (server-check); null = nog niet geladen */
  const [hasAppliedAdaptation, setHasAppliedAdaptation] = useState<
    boolean | null
  >(null);
  /** Maaltijdadvies van toegepaste aanpassing (intro + waarom dit werkt) */
  const [advisoryIntro, setAdvisoryIntro] = useState<string | undefined>(
    undefined,
  );
  const [advisoryWhyThisWorks, setAdvisoryWhyThisWorks] = useState<
    string[] | undefined
  >(undefined);
  /** Toggle: ontvouwen/inklappen van het "Waarom dit werkt"-paneel */
  const [advisoryPanelOpen, setAdvisoryPanelOpen] = useState(false);
  /** Recept verwijderen: dialog open, bezig, fout */
  const [deleteRecipeDialogOpen, setDeleteRecipeDialogOpen] = useState(false);
  const [isDeletingRecipe, setIsDeletingRecipe] = useState(false);
  const [deleteRecipeError, setDeleteRecipeError] = useState<string | null>(
    null,
  );
  /** Dialog voor bewerken bereidingsinstructies */
  const [instructionsEditOpen, setInstructionsEditOpen] = useState(false);
  /** Voeding van gerecht (berekend uit gekoppelde ingrediënten) */
  const [recipeNutritionSummary, setRecipeNutritionSummary] =
    useState<RecipeNutritionSummary | null>(null);
  const [recipeNutritionLoading, setRecipeNutritionLoading] = useState(false);
  /** Opgeslagen matches voor legacy-ingrediënten (uit recipe_ingredient_matches); null = nog niet geladen */
  const [resolvedLegacyMatches, setResolvedLegacyMatches] = useState<
    (ResolvedIngredientMatch | null)[] | null
  >(null);
  /** Een ingrediëntmatch wordt opgeslagen; voorkomt gelijktijdige updates */
  const [savingIngredientMatch, setSavingIngredientMatch] = useState(false);
  /** Notification na verwijderen ingrediënt (toast) */
  const [removeIngredientNotification, setRemoveIngredientNotification] =
    useState<{ message: string } | null>(null);
  const removeNotificationTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  /** Tag-edit dialogen */
  const [mealSlotDialogOpen, setMealSlotDialogOpen] = useState(false);
  const [sourceTagDialogOpen, setSourceTagDialogOpen] = useState(false);
  const [savingMealSlot, setSavingMealSlot] = useState(false);
  const [mealSlotEditValue, setMealSlotEditValue] = useState<string>('dinner');

  const router = useRouter();

  useEffect(() => {
    if (!removeIngredientNotification) return;
    if (removeNotificationTimeoutRef.current)
      clearTimeout(removeNotificationTimeoutRef.current);
    removeNotificationTimeoutRef.current = setTimeout(() => {
      setRemoveIngredientNotification(null);
      removeNotificationTimeoutRef.current = null;
    }, 4000);
    return () => {
      if (removeNotificationTimeoutRef.current)
        clearTimeout(removeNotificationTimeoutRef.current);
    };
  }, [removeIngredientNotification]);

  const mealId = meal?.id != null ? String(meal.id) : '';
  const handleRemoveIngredient = useCallback(
    async (index: number, displayName: string) => {
      if (!mealId) return;
      const result = await removeRecipeIngredientAction({
        mealId,
        source: mealSource,
        index,
      });
      if (!result.ok) return;
      onRecipeApplied?.();
      setRemoveIngredientNotification({
        message: `"${displayName}" uit recept verwijderd`,
      });
    },
    [mealId, mealSource, onRecipeApplied],
  );

  const mealUpdatedAt = meal?.updated_at ?? meal?.updatedAt;

  // Check of er een aangepaste versie is en laad advies (intro + whyThisWorks)
  useEffect(() => {
    if (!meal?.id) {
      queueMicrotask(() => {
        setHasAppliedAdaptation(false);
        setAdvisoryIntro(undefined);
        setAdvisoryWhyThisWorks(undefined);
      });
      return;
    }
    getHasAppliedAdaptationAction({ recipeId: String(meal.id) }).then(
      (result) => {
        if (result.ok) {
          setHasAppliedAdaptation(result.data.hasAppliedAdaptation);
          setAdvisoryIntro(result.data.intro);
          setAdvisoryWhyThisWorks(result.data.whyThisWorks);
        } else {
          setHasAppliedAdaptation(false);
          setAdvisoryIntro(undefined);
          setAdvisoryWhyThisWorks(undefined);
        }
      },
    );
  }, [meal?.id, mealUpdatedAt]); // meal.id for dependency

  const hasAdvisoryContent =
    hasAppliedAdaptation &&
    (Boolean(advisoryIntro?.trim()) ||
      (Array.isArray(advisoryWhyThisWorks) && advisoryWhyThisWorks.length > 0));

  // Get image URL: top-level first, then fallback to meal_data (for meal_history or older imports)
  const getMealImageUrl = useCallback((m: MealLike): string | null => {
    const top =
      (m.sourceImageUrl as string | null | undefined) ??
      (m.source_image_url as string | null | undefined) ??
      null;
    if (top && typeof top === 'string' && top.trim()) return top.trim();
    const data = (m.mealData ?? m.meal_data) as
      | Record<string, unknown>
      | null
      | undefined;
    if (data && typeof data === 'object') {
      const fromData =
        (data.sourceImageUrl as string | undefined) ??
        (data.source_image_url as string | undefined) ??
        (data.imageUrl as string | undefined) ??
        (data.image_url as string | undefined) ??
        (data.image as string | undefined);
      if (fromData && typeof fromData === 'string' && fromData.trim())
        return fromData.trim();
    }
    return null;
  }, []);

  const resolvedImageUrl = useMemo(
    () => getMealImageUrl(meal as MealLike),
    [meal, getMealImageUrl],
  );
  const [imageUrlOverride, setImageUrlOverride] = useState<
    string | null | undefined
  >(undefined);
  const imageUrl =
    imageUrlOverride !== undefined ? imageUrlOverride : resolvedImageUrl;

  // Reset override when switching to another meal
  useEffect(() => {
    setImageUrlOverride(undefined);
  }, [mealId]);

  const [recipeSource, setRecipeSource] = useState<string | null>(
    (meal as MealLike & { source?: string }).source ?? null,
  );

  // Sync displayed source from meal when parent refetches (e.g. after saving source).
  const mealSourceProp = (meal as MealLike & { source?: string }).source;

  useEffect(() => {
    const newSource = mealSourceProp ?? null;
    setRecipeSource(newSource);
  }, [mealSourceProp]);

  const formatMealSlot = (slot: string) => {
    const slotMap: Record<string, string> = {
      breakfast: 'Ontbijt',
      lunch: 'Lunch',
      dinner: 'Diner',
      snack: 'Snack',
      smoothie: 'Smoothie',
    };
    return slotMap[slot] || slot;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Get meal data (handle both structures)
  const mealData = (meal.mealData ?? meal.meal_data) as
    | MealDataLike
    | null
    | undefined;
  const mealName = String(meal.name ?? meal.mealName ?? meal.meal_name ?? '');
  const mealSlot = String(meal.mealSlot ?? meal.meal_slot ?? '');
  const dietKey = meal.dietKey ?? meal.diet_key;
  const aiAnalysis = (meal.aiAnalysis ?? meal.ai_analysis) as
    | Record<string, unknown>
    | undefined;
  const sourceUrl = (meal.sourceUrl ?? meal.source_url) as string | null;
  const mealDataOriginal = (meal.mealDataOriginal ??
    meal.meal_data_original ??
    null) as MealDataLike | null;
  const aiAnalysisOriginal = (meal.aiAnalysisOriginal ??
    meal.ai_analysis_original ??
    null) as Record<string, unknown> | null;
  const hasOriginal =
    (mealDataOriginal &&
      ((mealDataOriginal.ingredients?.length ?? 0) > 0 ||
        (mealDataOriginal.ingredientRefs?.length ?? 0) > 0)) ||
    (Array.isArray(aiAnalysisOriginal?.instructions) &&
      aiAnalysisOriginal.instructions.length > 0);
  const displayMealData: MealDataLike | null | undefined =
    viewingOriginal && mealDataOriginal ? mealDataOriginal : mealData;
  const displayAiAnalysis: Record<string, unknown> | null | undefined =
    viewingOriginal && aiAnalysisOriginal ? aiAnalysisOriginal : aiAnalysis;
  const consumptionCount =
    meal.consumptionCount ||
    meal.consumption_count ||
    meal.usageCount ||
    meal.usage_count ||
    0;
  const createdAt = meal.createdAt || meal.created_at;
  const firstConsumedAt =
    meal.firstConsumedAt ||
    meal.first_consumed_at ||
    meal.firstUsedAt ||
    meal.first_used_at;
  const lastConsumedAt =
    meal.lastConsumedAt ||
    meal.last_consumed_at ||
    meal.lastUsedAt ||
    meal.last_used_at;
  const userRating = meal.userRating || meal.user_rating;
  const nutritionScore = meal.nutritionScore || meal.nutrition_score;

  // Laad voeding van gerecht wanneer er gekoppelde ingrediënten zijn (ingredientRefs of legacy ingredients)
  const hasIngredientsForNutrition =
    (mealData?.ingredientRefs?.length ?? 0) > 0 ||
    (mealData?.ingredients?.length ?? 0) > 0;

  useEffect(() => {
    if (!meal?.id || !mealSource || !hasIngredientsForNutrition) {
      setRecipeNutritionSummary(null);
      return;
    }
    let cancelled = false;
    setRecipeNutritionLoading(true);
    getRecipeNutritionSummaryAction({ mealId, source: mealSource })
      .then((result) => {
        if (cancelled) return;
        setRecipeNutritionLoading(false);
        if (result.ok && result.data != null) {
          setRecipeNutritionSummary(result.data);
        } else {
          setRecipeNutritionSummary(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecipeNutritionLoading(false);
          setRecipeNutritionSummary(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [meal?.id, mealId, mealSource, hasIngredientsForNutrition, mealUpdatedAt]);

  // Laad opgeslagen matches voor legacy-ingrediënten (recipe_ingredient_matches) zodat alleen twijfelgevallen het waarschuwingsicoon tonen.
  // Ook doen wanneer er naast legacy ingredients al refs zijn (bijv. na AI-toevoegen van één ingrediënt), anders raken andere matches uit beeld.
  const hasLegacyIngredients = (displayMealData?.ingredients?.length ?? 0) > 0;

  useEffect(() => {
    if (!meal?.id || !hasLegacyIngredients || !displayMealData?.ingredients) {
      setResolvedLegacyMatches(null);
      return;
    }
    const ingredients = displayMealData.ingredients as MealIngredientLike[];
    const lineOptionsPerIngredient = ingredients.map(
      (ing: MealIngredientLike) => {
        const name = ing.name || ing.original_line || '';
        const qty = ing.quantity ?? ing.amount;
        const numQty =
          typeof qty === 'number'
            ? qty
            : typeof qty === 'string'
              ? parseFloat(qty)
              : undefined;
        const unit = (ing.unit ?? 'g')?.toString().trim() || 'g';
        const options: string[] = [];
        if (ing.original_line?.trim()) options.push(ing.original_line.trim());
        if (name.trim() && numQty != null && unit) {
          const fullLine = `${name.trim()} ${numQty} ${unit}`.trim();
          if (!options.includes(fullLine)) options.push(fullLine);
        }
        if (name.trim() && !options.includes(name.trim()))
          options.push(name.trim());
        return options.length > 0 ? options : [name || ''];
      },
    );
    if (lineOptionsPerIngredient.every((opts) => opts.length === 0)) {
      setResolvedLegacyMatches(null);
      return;
    }
    let cancelled = false;
    getResolvedIngredientMatchesAction(lineOptionsPerIngredient).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) setResolvedLegacyMatches(result.data);
        else setResolvedLegacyMatches(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [meal?.id, hasLegacyIngredients, displayMealData?.ingredients]);

  const handleLegacyIngredientConfirmed = useCallback(() => {
    if (onIngredientMatched) {
      onIngredientMatched();
      return;
    }
    onRecipeApplied?.();
    const ingredients = displayMealData?.ingredients as
      | MealIngredientLike[]
      | undefined;
    if (ingredients?.length) {
      const lineOptionsPerIngredient = ingredients.map(
        (ing: MealIngredientLike) => {
          const name = ing.name || ing.original_line || '';
          const qty = ing.quantity ?? ing.amount;
          const numQty =
            typeof qty === 'number'
              ? qty
              : typeof qty === 'string'
                ? parseFloat(qty)
                : undefined;
          const unit = (ing.unit ?? 'g')?.toString().trim() || 'g';
          const options: string[] = [];
          if (ing.original_line?.trim()) options.push(ing.original_line.trim());
          if (name.trim() && numQty != null && unit) {
            const fullLine = `${name.trim()} ${numQty} ${unit}`.trim();
            if (!options.includes(fullLine)) options.push(fullLine);
          }
          if (name.trim() && !options.includes(name.trim()))
            options.push(name.trim());
          return options.length > 0 ? options : [name || ''];
        },
      );
      getResolvedIngredientMatchesAction(lineOptionsPerIngredient).then((r) => {
        if (r.ok) setResolvedLegacyMatches(r.data);
      });
    }
  }, [onIngredientMatched, onRecipeApplied, displayMealData?.ingredients]);

  const handleEditIngredient = useCallback(
    async (
      index: number,
      patch: {
        name: string;
        quantity?: string | number | null;
        unit?: string | null;
        note?: string | null;
      },
    ) => {
      const ingredients = (displayMealData?.ingredients ??
        []) as MealIngredientLike[];
      if (index < 0 || index >= ingredients.length) return;
      const current = ingredients.map((ing: MealIngredientLike) => ({
        name: ing.name ?? ing.original_line ?? '',
        quantity: ing.quantity ?? ing.amount ?? null,
        unit: ing.unit ?? null,
        note: ing.note ?? ing.notes ?? null,
        section: ing.section ?? null,
      }));
      const next = current.map((ing, i) =>
        i === index
          ? {
              ...ing,
              name: patch.name,
              quantity: patch.quantity ?? ing.quantity,
              unit: patch.unit ?? ing.unit,
              note: patch.note ?? ing.note,
            }
          : ing,
      );
      const instructions = getInstructionsForEditor(aiAnalysis);
      const result = await updateRecipeContentAction({
        mealId,
        source: mealSource,
        ingredients: next,
        instructions,
      });
      if (result.ok) {
        onRecipeApplied?.();
      } else {
        showToast({
          type: 'error',
          title: 'Fout',
          description: result.error?.message ?? 'Bijwerken mislukt',
        });
      }
    },
    [
      displayMealData?.ingredients,
      aiAnalysis,
      mealId,
      mealSource,
      onRecipeApplied,
      showToast,
    ],
  );

  const formatDietTypeName = (
    dietKey: string | null | undefined,
  ): string | null => {
    if (!dietKey) return null;
    // Replace underscores with spaces and capitalize first letter of each word
    return dietKey
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10 overflow-hidden">
        {/* Receptafbeelding bovenaan met knoppen (Vervangen, Verwijderen, Genereer met AI) */}
        <RecipeImageUpload
          mealId={mealId}
          source={mealSource}
          currentImageUrl={imageUrl ?? null}
          onImageUploaded={(url) => {
            setImageUrlOverride(url);
            window.location.reload();
          }}
          onImageRemoved={() => {
            setImageUrlOverride(null);
            window.location.reload();
          }}
          onImageClick={() => setLightboxOpen(true)}
          recipeContext={{
            name: mealName,
            summary:
              Array.isArray(displayMealData?.ingredients) &&
              displayMealData.ingredients.length > 0
                ? `Ingrediënten: ${(
                    displayMealData.ingredients as { name?: string }[]
                  )
                    .slice(0, 5)
                    .map((i) => i.name ?? '')
                    .filter(Boolean)
                    .join(
                      ', ',
                    )}${(displayMealData.ingredients as unknown[]).length > 5 ? '…' : ''}`
                : Array.isArray(displayAiAnalysis?.instructions) &&
                    displayAiAnalysis.instructions.length > 0
                  ? `Bereiding: ${String(
                      (
                        displayAiAnalysis.instructions as {
                          text?: string;
                          step?: string;
                        }[]
                      )[0]?.text ??
                        (displayAiAnalysis.instructions as string[])[0] ??
                        '',
                    ).slice(0, 120)}…`
                  : undefined,
          }}
          renderHero
        />
        <div className="p-6">
          <div className="flex flex-col gap-6 mb-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-zinc-950 dark:text-white mb-2">
                {mealName}
              </h2>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <Badge color={mealSource === 'custom' ? 'blue' : 'zinc'}>
                  {mealSource === 'custom' ? 'Custom' : 'Gemini'}
                </Badge>
                <RecipeEditableTag
                  label={formatMealSlot(mealSlot)}
                  color="zinc"
                  editable
                  onEdit={() => {
                    setMealSlotEditValue(mealSlot);
                    setMealSlotDialogOpen(true);
                  }}
                  onRemove={async () => {
                    const res = await fetch('/api/recipes/update-meal-slot', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        mealId,
                        source: mealSource,
                        mealSlot: 'dinner',
                      }),
                    });
                    const data = await res.json();
                    if (data.ok) window.location.reload();
                    else
                      showToast({
                        type: 'error',
                        title: data.error?.message ?? 'Bijwerken mislukt',
                      });
                  }}
                />
                {formatDietTypeName(
                  dietKey != null ? String(dietKey) : undefined,
                ) && (
                  <Badge color="green" className="text-xs">
                    {formatDietTypeName(
                      dietKey != null ? String(dietKey) : undefined,
                    )}
                  </Badge>
                )}
                {complianceScore != null && (
                  <Badge
                    color={
                      complianceScore.noRulesConfigured
                        ? 'zinc'
                        : complianceScore.scorePercent >= 80
                          ? 'green'
                          : complianceScore.scorePercent >= 50
                            ? 'amber'
                            : 'red'
                    }
                    className={
                      complianceScore.noRulesConfigured
                        ? 'text-xs'
                        : 'font-mono text-xs'
                    }
                    title={
                      complianceScore.noRulesConfigured
                        ? 'Geen dieetregels geconfigureerd voor dit dieet'
                        : complianceScore.ok
                          ? 'Voldoet aan dieetregels'
                          : complianceScore.violatingCount != null &&
                              complianceScore.violatingCount > 0
                            ? `${complianceScore.violatingCount} ingrediënt of bereidingsstap wijkt af (verboden term in recept of stappen)`
                            : 'Schendt één of meer dieetregels'
                    }
                  >
                    Compliance{' '}
                    {complianceScore.noRulesConfigured
                      ? 'N.v.t.'
                      : `${complianceScore.scorePercent}%`}
                  </Badge>
                )}
                <RecipeEditableTag
                  label={recipeSource ?? 'Geen bron'}
                  color="purple"
                  className="text-xs"
                  editable
                  onEdit={() => setSourceTagDialogOpen(true)}
                  onRemove={
                    recipeSource
                      ? async () => {
                          const response = await fetch(
                            '/api/recipes/update-source',
                            {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                mealId,
                                source: mealSource,
                                recipeSource: null,
                              }),
                            },
                          );
                          const result = await response.json();
                          if (result.ok) {
                            setRecipeSource(null);
                            showToast({
                              type: 'success',
                              title: 'Bron verwijderd',
                              description: 'Receptbron is verwijderd.',
                            });
                            setSourceTagDialogOpen(false);
                            onSourceSaved?.();
                          } else {
                            showToast({
                              type: 'error',
                              title:
                                result.error?.message ?? 'Verwijderen mislukt',
                            });
                          }
                        }
                      : undefined
                  }
                />
              </div>

              {/* Meal slot edit dialog */}
              <Dialog
                open={mealSlotDialogOpen}
                onClose={() => setMealSlotDialogOpen(false)}
              >
                <DialogTitle>Maaltijdmoment wijzigen</DialogTitle>
                <DialogBody>
                  <DialogDescription>
                    Kies het moment van de dag voor dit recept.
                  </DialogDescription>
                  <Field className="mt-3">
                    <Label>Maaltijdmoment</Label>
                    <Select
                      value={mealSlotEditValue}
                      onChange={(e) => setMealSlotEditValue(e.target.value)}
                      disabled={savingMealSlot}
                    >
                      <option value="breakfast">Ontbijt</option>
                      <option value="lunch">Lunch</option>
                      <option value="dinner">Diner</option>
                      <option value="snack">Snack</option>
                    </Select>
                  </Field>
                </DialogBody>
                <DialogActions>
                  <Button
                    plain
                    onClick={() => setMealSlotDialogOpen(false)}
                    disabled={savingMealSlot}
                  >
                    Annuleren
                  </Button>
                  <Button
                    color="primary"
                    disabled={savingMealSlot}
                    onClick={async () => {
                      setSavingMealSlot(true);
                      try {
                        const res = await fetch(
                          '/api/recipes/update-meal-slot',
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              mealId,
                              source: mealSource,
                              mealSlot: mealSlotEditValue,
                            }),
                          },
                        );
                        const data = await res.json();
                        if (data.ok) {
                          showToast({
                            type: 'success',
                            title: 'Maaltijdmoment opgeslagen',
                          });
                          setMealSlotDialogOpen(false);
                          window.location.reload();
                        } else {
                          showToast({
                            type: 'error',
                            title: data.error?.message ?? 'Opslaan mislukt',
                          });
                        }
                      } finally {
                        setSavingMealSlot(false);
                      }
                    }}
                  >
                    {savingMealSlot ? 'Opslaan…' : 'Opslaan'}
                  </Button>
                </DialogActions>
              </Dialog>

              {/* Source tag edit dialog */}
              <Dialog
                open={sourceTagDialogOpen}
                onClose={() => setSourceTagDialogOpen(false)}
              >
                <DialogTitle>Bron wijzigen</DialogTitle>
                <DialogBody>
                  <DialogDescription>
                    Wijzig of verwijder de receptbron (bijv. website of boek).
                  </DialogDescription>
                  <div className="mt-3">
                    <RecipeSourceEditor
                      currentSource={recipeSource}
                      mealId={mealId}
                      source={mealSource}
                      onSourceUpdated={(newSource) => {
                        setRecipeSource(newSource);
                        showToast({
                          type: 'success',
                          title: 'Bron opgeslagen',
                          description: newSource
                            ? `Receptbron is bijgewerkt naar "${newSource}".`
                            : 'Receptbron is verwijderd.',
                        });
                        onSourceSaved?.();
                        setSourceTagDialogOpen(false);
                      }}
                    />
                  </div>
                </DialogBody>
                <DialogActions>
                  <Button plain onClick={() => setSourceTagDialogOpen(false)}>
                    Sluiten
                  </Button>
                </DialogActions>
              </Dialog>

              {/* AI Magician + Waarom dit werkt toggle */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={() => setAiMagicianOpen(true)}>
                  <SparklesIcon data-slot="icon" />
                  AI Magician
                </Button>
                {hasAdvisoryContent && (
                  <Button
                    outline
                    onClick={() => setAdvisoryPanelOpen((open) => !open)}
                    aria-expanded={advisoryPanelOpen}
                    aria-controls="advisory-panel"
                  >
                    <LightBulbIcon data-slot="icon" />
                    Waarom dit werkt voor jouw dieet
                    {advisoryPanelOpen ? (
                      <ChevronUpIcon className="ml-1 h-4 w-4" />
                    ) : (
                      <ChevronDownIcon className="ml-1 h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>

              {/* Uitklapmenu: maaltijdadvies direct onder de toggle */}
              {hasAdvisoryContent && advisoryPanelOpen && (
                <div
                  id="advisory-panel"
                  role="region"
                  aria-label="Waarom dit werkt voor jouw dieet"
                  className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/30 p-4"
                >
                  <Text className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-3">
                    Waarom dit werkt voor jouw dieet
                  </Text>
                  {advisoryIntro?.trim() && (
                    <Text className="text-sm text-emerald-800 dark:text-emerald-200 mb-3 whitespace-pre-wrap">
                      {advisoryIntro}
                    </Text>
                  )}
                  {Array.isArray(advisoryWhyThisWorks) &&
                    advisoryWhyThisWorks.length > 0 && (
                      <ul className="space-y-1.5">
                        {advisoryWhyThisWorks.map((bullet, idx) => (
                          <li
                            key={idx}
                            className="text-sm text-emerald-800 dark:text-emerald-200 flex items-start gap-2"
                          >
                            <span className="text-emerald-500 dark:text-emerald-400 mt-0.5">
                              •
                            </span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              )}
            </div>
          </div>
          {imageUrl && (
            <ImageLightbox
              open={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              imageUrl={imageUrl}
              alt={mealName}
            />
          )}

          {/* Prep Time and Servings Editor */}
          <div className="mt-4">
            <RecipePrepTimeAndServingsEditor
              currentPrepTime={
                typeof mealData?.prepTime === 'number'
                  ? mealData.prepTime
                  : typeof mealData?.prepTime === 'string'
                    ? parseFloat(mealData.prepTime) || null
                    : null
              }
              currentServings={
                typeof mealData?.servings === 'number'
                  ? mealData.servings
                  : typeof mealData?.servings === 'string'
                    ? parseFloat(mealData.servings) || null
                    : null
              }
              mealId={mealId}
              source={mealSource}
              onUpdated={() => {
                // Refresh the page to show updated data
                window.location.reload();
              }}
            />
          </div>

          {/* Basic Info */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {consumptionCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-600 dark:text-zinc-400">
                  {mealSource === 'custom' ? 'Geconsumeerd' : 'Gebruikt'}:{' '}
                  <span className="font-medium">{consumptionCount}x</span>
                </span>
              </div>
            )}

            {userRating != null && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Beoordeling:
                </span>
                <div className="flex items-center gap-1">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <StarIcon
                        key={star}
                        className={`h-4 w-4 ${
                          star <= Number(userRating)
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-zinc-300 dark:text-zinc-700 fill-zinc-300 dark:fill-zinc-700'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-medium text-zinc-900 dark:text-white ml-1">
                    {Number(userRating)}/5
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
            {createdAt && <div>Toegevoegd: {formatDate(createdAt)}</div>}
            {firstConsumedAt && (
              <div>
                Eerst {mealSource === 'custom' ? 'geconsumeerd' : 'gebruikt'}:{' '}
                {formatDate(firstConsumedAt)}
              </div>
            )}
            {lastConsumedAt && (
              <div>
                Laatst {mealSource === 'custom' ? 'geconsumeerd' : 'gebruikt'}:{' '}
                {formatDate(lastConsumedAt)}
              </div>
            )}
          </div>

          {/* Bron-URL (originele receptpagina) */}
          {sourceUrl && (
            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700 text-sm">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline"
              >
                <LinkIcon className="h-4 w-4 flex-shrink-0" />
                Bron: originele receptpagina
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Bekijk origineel / aangepaste versie toggle – alleen als er een aangepaste versie is (server-check) */}
      {hasAppliedAdaptation === true && hasOriginal && (
        <div className="mb-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-3 flex items-center justify-between gap-4">
          <Text className="text-sm text-zinc-700 dark:text-zinc-300">
            {viewingOriginal
              ? 'Je bekijkt de originele versie.'
              : 'Je bekijkt de aangepaste versie.'}
          </Text>
          <Button
            outline
            onClick={() => setViewingOriginal((v) => !v)}
            className="flex-shrink-0"
          >
            {viewingOriginal ? 'Bekijk aangepaste versie' : 'Bekijk origineel'}
          </Button>
        </div>
      )}

      {/* AI Analysis / Instructions */}
      {(displayAiAnalysis || aiAnalysis) && (
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Bereidingsinstructies
            </h3>
            {!viewingOriginal && (
              <Button
                plain
                onClick={() => setInstructionsEditOpen(true)}
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <PencilIcon className="h-4 w-4 mr-1.5 inline-block" />
                Bewerk
              </Button>
            )}
          </div>
          {displayAiAnalysis?.instructions &&
          Array.isArray(displayAiAnalysis.instructions) ? (
            <ol className="space-y-2 list-decimal list-inside text-sm text-zinc-600 dark:text-zinc-400">
              {displayAiAnalysis.instructions.map(
                (instruction: InstructionLike, idx: number) => {
                  // Handle both string format and object format {step, text}
                  const instructionText =
                    typeof instruction === 'string'
                      ? instruction
                      : instruction?.text ||
                        instruction?.step ||
                        String(instruction);
                  return <li key={idx}>{instructionText}</li>;
                },
              )}
            </ol>
          ) : displayAiAnalysis?.instructions ? (
            <Text className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
              {typeof displayAiAnalysis.instructions === 'string'
                ? displayAiAnalysis.instructions
                : String(displayAiAnalysis.instructions)}
            </Text>
          ) : (
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              Geen instructies beschikbaar
            </Text>
          )}

          {/* Dialog: bewerk alleen bereidingsinstructies */}
          <Dialog
            open={instructionsEditOpen}
            onClose={() => setInstructionsEditOpen(false)}
            size="xl"
          >
            <DialogTitle>Bereidingsinstructies bewerken</DialogTitle>
            <DialogBody>
              <RecipeContentEditor
                key={instructionsEditOpen ? 'edit-open' : 'edit-closed'}
                mealId={mealId}
                mealSource={mealSource}
                ingredients={getIngredientsForEditor(mealData)}
                instructions={getInstructionsForEditor(aiAnalysis)}
                instructionsOnly
                onUpdated={() => {
                  setInstructionsEditOpen(false);
                  onRecipeApplied?.();
                }}
                onCancel={() => setInstructionsEditOpen(false)}
              />
            </DialogBody>
          </Dialog>
        </div>
      )}

      {/* Ingredients */}
      {((displayMealData?.ingredientRefs &&
        displayMealData.ingredientRefs.length > 0) ||
        (displayMealData?.ingredients &&
          displayMealData.ingredients.length > 0)) && (
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white mb-4">
            Ingrediënten
          </h3>
          <ul className="space-y-0.5 text-sm">
            {/* Parallel formaat: refs[i] hoort bij ingredients[i] — één lijst in importvolgorde */}
            {displayMealData?.ingredientRefs &&
              displayMealData?.ingredients &&
              displayMealData.ingredientRefs.length ===
                displayMealData.ingredients.length &&
              (() => {
                const refs =
                  displayMealData.ingredientRefs as IngredientRefLike[];
                const legacyList =
                  displayMealData.ingredients as MealIngredientLike[];
                return legacyList.map(
                  (ing: MealIngredientLike, idx: number) => {
                    const ref = refs[idx];
                    const isRefSlot =
                      ref &&
                      typeof ref === 'object' &&
                      (ref.nevoCode != null ||
                        ref.customFoodId != null ||
                        ref.fdcId != null);
                    if (isRefSlot) {
                      const name =
                        (ref.customFoodId &&
                          customFoodNamesById[ref.customFoodId]) ||
                        (ref.nevoCode != null &&
                          nevoFoodNamesByCode[String(ref.nevoCode)]) ||
                        ref.displayName ||
                        (ref.customFoodId
                          ? 'Eigen ingrediënt'
                          : ref.fdcId != null
                            ? 'FNDDS ingrediënt'
                            : `NEVO ${ref.nevoCode}`);
                      const refQty = ref.quantity;
                      const refUnit =
                        (ref.unit ?? 'g')?.toString().trim() || 'g';
                      const refQtyG = ref.quantityG ?? ref.quantity_g;
                      const amountG =
                        typeof refQtyG === 'number' && refQtyG > 0
                          ? refQtyG
                          : typeof refQty === 'number' && refUnit
                            ? quantityUnitToGrams(refQty, refUnit)
                            : 0;
                      const quantityLabel =
                        typeof refQty === 'number' && refUnit && refUnit !== 'g'
                          ? `${refQty} ${refUnit}`
                          : amountG > 0
                            ? `${amountG}g`
                            : undefined;
                      const nevoCode =
                        typeof ref.nevoCode === 'string'
                          ? parseInt(ref.nevoCode, 10)
                          : ref.nevoCode;
                      const match = ref.customFoodId
                        ? {
                            source: 'custom' as const,
                            customFoodId: ref.customFoodId,
                          }
                        : ref.fdcId != null
                          ? {
                              source: 'fndds' as const,
                              fdcId:
                                typeof ref.fdcId === 'number'
                                  ? ref.fdcId
                                  : Number(ref.fdcId),
                            }
                          : typeof nevoCode === 'number' &&
                              Number.isFinite(nevoCode) &&
                              nevoCode > 0
                            ? { source: 'nevo' as const, nevoCode }
                            : null;
                      const refQtyNum =
                        typeof refQty === 'number'
                          ? refQty
                          : typeof refQty === 'string'
                            ? parseFloat(refQty)
                            : undefined;
                      return (
                        <li
                          key={idx}
                          className="text-zinc-600 dark:text-zinc-400"
                        >
                          <IngredientRowWithNutrition
                            displayName={name}
                            amountG={amountG}
                            quantityLabel={quantityLabel}
                            quantity={refQtyNum}
                            unit={refUnit}
                            match={match}
                            mealId={mealId}
                            mealSource={mealSource}
                            ingredientIndex={idx}
                            onConfirmed={handleLegacyIngredientConfirmed}
                            externalSaving={savingIngredientMatch}
                            onSavingChange={setSavingIngredientMatch}
                            onRemove={
                              !viewingOriginal
                                ? () => handleRemoveIngredient(idx, name)
                                : undefined
                            }
                          />
                        </li>
                      );
                    }
                    const name =
                      resolvedLegacyMatches?.[idx]?.displayName ??
                      (ing.name ||
                        ing.original_line ||
                        `Ingrediënt ${idx + 1}`);
                    const quantity = ing.quantity ?? ing.amount;
                    const numQty =
                      typeof quantity === 'number'
                        ? quantity
                        : typeof quantity === 'string'
                          ? parseFloat(quantity)
                          : undefined;
                    const unit = (ing.unit ?? 'g')?.toString().trim() || 'g';
                    const note = ing.note ?? ing.notes;
                    const isToTaste = isToTasteIngredient(name);
                    const quantityUnknown =
                      numQty == null ||
                      (isToTaste && unit === 'g' && numQty === 100);
                    const quantityLabel = quantityUnknown
                      ? undefined
                      : numQty != null
                        ? `${numQty} ${unit}`
                        : undefined;
                    const amountG =
                      quantityUnknown && isToTaste
                        ? 0
                        : unit === 'g' &&
                            typeof numQty === 'number' &&
                            numQty > 0
                          ? numQty
                          : typeof numQty === 'number' && numQty > 0
                            ? quantityUnitToGrams(numQty, unit)
                            : 100;
                    return (
                      <li
                        key={idx}
                        className="text-zinc-600 dark:text-zinc-400"
                      >
                        <IngredientRowWithNutrition
                          displayName={name}
                          amountG={amountG}
                          quantityLabel={quantityLabel}
                          quantity={numQty}
                          unit={unit}
                          note={note ?? undefined}
                          match={resolvedLegacyMatches?.[idx] ?? null}
                          mealId={mealId}
                          mealSource={mealSource}
                          ingredientIndex={idx}
                          onConfirmed={handleLegacyIngredientConfirmed}
                          externalSaving={savingIngredientMatch}
                          onSavingChange={setSavingIngredientMatch}
                          onRemove={
                            !viewingOriginal
                              ? () => handleRemoveIngredient(idx, name)
                              : undefined
                          }
                          onEdit={
                            !viewingOriginal
                              ? (patch) => handleEditIngredient(idx, patch)
                              : undefined
                          }
                        />
                      </li>
                    );
                  },
                );
              })()}
            {/* Alleen refs (geen ingredients): puur ref-lijst, nulls overslaan */}
            {displayMealData?.ingredientRefs &&
              displayMealData.ingredientRefs.length > 0 &&
              (!displayMealData?.ingredients ||
                displayMealData.ingredients.length === 0) &&
              (displayMealData.ingredientRefs as IngredientRefLike[])
                .map((ref, idx) => ({ ref, idx }))
                .filter(
                  (x: { ref: IngredientRefLike }) =>
                    x.ref &&
                    typeof x.ref === 'object' &&
                    (x.ref.nevoCode != null ||
                      x.ref.customFoodId != null ||
                      x.ref.fdcId != null),
                )
                .map(
                  ({ ref, idx }: { ref: IngredientRefLike; idx: number }) => {
                    const name =
                      (ref.customFoodId &&
                        customFoodNamesById[ref.customFoodId]) ||
                      (ref.nevoCode != null &&
                        nevoFoodNamesByCode[String(ref.nevoCode)]) ||
                      ref.displayName ||
                      (ref.customFoodId
                        ? 'Eigen ingrediënt'
                        : ref.fdcId != null
                          ? 'FNDDS ingrediënt'
                          : `NEVO ${ref.nevoCode}`);
                    const refQty = ref.quantity;
                    const refUnit = (ref.unit ?? 'g')?.toString().trim() || 'g';
                    const refQtyG = ref.quantityG ?? ref.quantity_g;
                    const amountG =
                      typeof refQtyG === 'number' && refQtyG > 0
                        ? refQtyG
                        : typeof refQty === 'number' && refUnit
                          ? quantityUnitToGrams(refQty, refUnit)
                          : 0;
                    const quantityLabel =
                      typeof refQty === 'number' && refUnit && refUnit !== 'g'
                        ? `${refQty} ${refUnit}`
                        : amountG > 0
                          ? `${amountG}g`
                          : undefined;
                    const nevoCode =
                      typeof ref.nevoCode === 'string'
                        ? parseInt(ref.nevoCode, 10)
                        : ref.nevoCode;
                    const match = ref.customFoodId
                      ? {
                          source: 'custom' as const,
                          customFoodId: ref.customFoodId,
                        }
                      : ref.fdcId != null
                        ? {
                            source: 'fndds' as const,
                            fdcId:
                              typeof ref.fdcId === 'number'
                                ? ref.fdcId
                                : Number(ref.fdcId),
                          }
                        : typeof nevoCode === 'number' &&
                            Number.isFinite(nevoCode) &&
                            nevoCode > 0
                          ? { source: 'nevo' as const, nevoCode }
                          : null;
                    return (
                      <li
                        key={idx}
                        className="text-zinc-600 dark:text-zinc-400"
                      >
                        <IngredientRowWithNutrition
                          displayName={name}
                          amountG={amountG}
                          quantityLabel={quantityLabel}
                          match={match}
                          onRemove={
                            !viewingOriginal
                              ? () => handleRemoveIngredient(idx, name)
                              : undefined
                          }
                        />
                      </li>
                    );
                  },
                )}
            {/* Show ingredients (legacy format, geen parallel refs) — met secties als aanwezig */}
            {displayMealData?.ingredients &&
              displayMealData.ingredients.length > 0 &&
              !(
                displayMealData?.ingredientRefs &&
                displayMealData.ingredientRefs.length ===
                  displayMealData.ingredients.length
              ) &&
              (() => {
                const legacyList =
                  displayMealData.ingredients as MealIngredientLike[];
                const hasSections = legacyList.some(
                  (ing: MealIngredientLike) =>
                    ing.section != null && String(ing.section).trim() !== '',
                );
                if (!hasSections) {
                  return legacyList.map(
                    (ing: MealIngredientLike, idx: number) => {
                      const name =
                        resolvedLegacyMatches?.[idx]?.displayName ??
                        (ing.name ||
                          ing.original_line ||
                          `Ingrediënt ${idx + 1}`);
                      const quantity = ing.quantity ?? ing.amount;
                      const numQty =
                        typeof quantity === 'number'
                          ? quantity
                          : typeof quantity === 'string'
                            ? parseFloat(quantity)
                            : undefined;
                      const unit = (ing.unit ?? 'g')?.toString().trim() || 'g';
                      const note = ing.note ?? ing.notes;
                      const isToTaste = isToTasteIngredient(name);
                      const quantityUnknown =
                        numQty == null ||
                        (isToTaste && unit === 'g' && numQty === 100);
                      const quantityLabel = quantityUnknown
                        ? undefined
                        : numQty != null
                          ? `${numQty} ${unit}`
                          : undefined;
                      const amountG =
                        quantityUnknown && isToTaste
                          ? 0
                          : unit === 'g' &&
                              typeof numQty === 'number' &&
                              numQty > 0
                            ? numQty
                            : typeof numQty === 'number' && numQty > 0
                              ? quantityUnitToGrams(numQty, unit)
                              : 100;
                      return (
                        <li
                          key={idx}
                          className="text-zinc-600 dark:text-zinc-400"
                        >
                          <IngredientRowWithNutrition
                            displayName={name}
                            amountG={amountG}
                            quantityLabel={quantityLabel}
                            quantity={numQty}
                            unit={unit}
                            note={note ?? undefined}
                            match={resolvedLegacyMatches?.[idx] ?? null}
                            mealId={mealId}
                            mealSource={mealSource}
                            ingredientIndex={idx}
                            onConfirmed={handleLegacyIngredientConfirmed}
                            externalSaving={savingIngredientMatch}
                            onSavingChange={setSavingIngredientMatch}
                            onRemove={
                              !viewingOriginal
                                ? () => handleRemoveIngredient(idx, name)
                                : undefined
                            }
                            onEdit={
                              !viewingOriginal
                                ? (patch) => handleEditIngredient(idx, patch)
                                : undefined
                            }
                          />
                        </li>
                      );
                    },
                  );
                }
                // Groepeer op sectie (volgorde behouden)
                const groups: { section: string | null; indices: number[] }[] =
                  [];
                let curSection: string | null = null;
                let curIndices: number[] = [];
                for (let i = 0; i < legacyList.length; i++) {
                  const s =
                    legacyList[i].section != null &&
                    String(legacyList[i].section).trim() !== ''
                      ? String(legacyList[i].section).trim()
                      : null;
                  if (s !== curSection) {
                    if (curIndices.length > 0)
                      groups.push({ section: curSection, indices: curIndices });
                    curSection = s;
                    curIndices = [i];
                  } else {
                    curIndices.push(i);
                  }
                }
                if (curIndices.length > 0)
                  groups.push({ section: curSection, indices: curIndices });

                return groups.map((group, gi) => (
                  <Fragment key={gi}>
                    {group.section && (
                      <li className="list-none mt-3 first:mt-0">
                        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {group.section}
                        </h4>
                      </li>
                    )}
                    {group.indices.map((idx) => {
                      const ing = legacyList[idx];
                      const name =
                        resolvedLegacyMatches?.[idx]?.displayName ??
                        (ing.name ||
                          ing.original_line ||
                          `Ingrediënt ${idx + 1}`);
                      const quantity = ing.quantity ?? ing.amount;
                      const numQty =
                        typeof quantity === 'number'
                          ? quantity
                          : typeof quantity === 'string'
                            ? parseFloat(quantity)
                            : undefined;
                      const unit = (ing.unit ?? 'g')?.toString().trim() || 'g';
                      const note = ing.note ?? ing.notes;
                      const isToTaste = isToTasteIngredient(name);
                      const quantityUnknown =
                        numQty == null ||
                        (isToTaste && unit === 'g' && numQty === 100);
                      const quantityLabel = quantityUnknown
                        ? undefined
                        : numQty != null
                          ? `${numQty} ${unit}`
                          : undefined;
                      const amountG =
                        quantityUnknown && isToTaste
                          ? 0
                          : unit === 'g' &&
                              typeof numQty === 'number' &&
                              numQty > 0
                            ? numQty
                            : typeof numQty === 'number' && numQty > 0
                              ? quantityUnitToGrams(numQty, unit)
                              : 100;
                      return (
                        <li
                          key={idx}
                          className="text-zinc-600 dark:text-zinc-400"
                        >
                          <IngredientRowWithNutrition
                            displayName={name}
                            amountG={amountG}
                            quantityLabel={quantityLabel}
                            quantity={numQty}
                            unit={unit}
                            note={note ?? undefined}
                            match={resolvedLegacyMatches?.[idx] ?? null}
                            mealId={mealId}
                            mealSource={mealSource}
                            ingredientIndex={idx}
                            onConfirmed={handleLegacyIngredientConfirmed}
                            externalSaving={savingIngredientMatch}
                            onSavingChange={setSavingIngredientMatch}
                            onRemove={
                              !viewingOriginal
                                ? () => handleRemoveIngredient(idx, name)
                                : undefined
                            }
                            onEdit={
                              !viewingOriginal
                                ? (patch) => handleEditIngredient(idx, patch)
                                : undefined
                            }
                          />
                        </li>
                      );
                    })}
                  </Fragment>
                ));
              })()}
          </ul>
        </div>
      )}

      {/* Voeding van gerecht (onder ingrediënten, alleen als ingrediënten gekoppeld zijn) */}
      {hasIngredientsForNutrition && (
        <RecipeNutritionKpi
          summary={recipeNutritionSummary}
          loading={recipeNutritionLoading}
        />
      )}

      {/* Notes Editor */}
      <RecipeNotesEditor
        initialContent={
          typeof meal.notes === 'string'
            ? meal.notes
            : meal.notes != null
              ? String(meal.notes)
              : null
        }
        onSave={async (content) => {
          const result = await updateRecipeNotesAction({
            mealId,
            source: mealSource,
            notes: content === '<p></p>' ? null : content,
          });
          if (!result.ok) {
            throw new Error(result.error.message);
          }
        }}
        mealId={mealId}
        source={mealSource}
      />

      {/* Nutrition Info */}
      {(mealData?.estimatedMacros || mealData?.nutrition) && (
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white mb-4">
            Voedingswaarden
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {(mealData.estimatedMacros || mealData.nutrition)?.calories !==
              undefined && (
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">
                  Calorieën:
                </span>{' '}
                <span className="font-medium text-zinc-900 dark:text-white">
                  {Math.round(
                    Number(
                      (mealData.estimatedMacros || mealData.nutrition)
                        ?.calories,
                    ),
                  )}{' '}
                  kcal
                </span>
              </div>
            )}
            {(mealData.estimatedMacros || mealData.nutrition)?.protein !==
              undefined && (
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">Eiwit:</span>{' '}
                <span className="font-medium text-zinc-900 dark:text-white">
                  {Math.round(
                    Number(
                      (mealData.estimatedMacros || mealData.nutrition)?.protein,
                    ),
                  )}
                  g
                </span>
              </div>
            )}
            {(mealData.estimatedMacros || mealData.nutrition)?.carbs !==
              undefined && (
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">
                  Koolhydraten:
                </span>{' '}
                <span className="font-medium text-zinc-900 dark:text-white">
                  {Math.round(
                    Number(
                      (mealData.estimatedMacros || mealData.nutrition)?.carbs,
                    ),
                  )}
                  g
                </span>
              </div>
            )}
            {(mealData.estimatedMacros || mealData.nutrition)?.fat !==
              undefined && (
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">Vet:</span>{' '}
                <span className="font-medium text-zinc-900 dark:text-white">
                  {Math.round(
                    Number(
                      (mealData.estimatedMacros || mealData.nutrition)?.fat,
                    ),
                  )}
                  g
                </span>
              </div>
            )}
            {(mealData.estimatedMacros || mealData.nutrition)?.saturatedFat !==
              undefined && (
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">
                  Verzadigd vet:
                </span>{' '}
                <span className="font-medium text-zinc-900 dark:text-white">
                  {Math.round(
                    Number(
                      (mealData.estimatedMacros || mealData.nutrition)
                        ?.saturatedFat,
                    ),
                  )}
                  g
                </span>
              </div>
            )}
            {nutritionScore !== null && nutritionScore !== undefined && (
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">
                  Voedingsscore:
                </span>{' '}
                <span className="font-medium text-zinc-900 dark:text-white">
                  {Math.round(Number(nutritionScore))}/100
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aangepaste versie verwijderen – alleen tonen als er een aangepaste versie is (server-check) */}
      {hasAppliedAdaptation === true && (
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10 border-t border-zinc-200 dark:border-zinc-800">
          <Text className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
            Je bekijkt dit recept met een door de AI Magician aangepaste versie.
            Je kunt de aanpassing ongedaan maken en teruggaan naar de originele
            versie.
          </Text>
          <Button
            outline
            disabled={isRemovingAdaptation}
            onClick={() => setConfirmRemoveOpen(true)}
            className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <TrashIcon className="h-4 w-4" />
            Aangepaste versie verwijderen
          </Button>
          {removeAdaptationError && (
            <Text className="text-sm text-red-600 dark:text-red-400 mt-2">
              {removeAdaptationError}
            </Text>
          )}
        </div>
      )}

      {/* Bevestigingspopup: aangepaste versie verwijderen */}
      <Dialog
        open={confirmRemoveOpen}
        onClose={() => {
          if (!isRemovingAdaptation) {
            setConfirmRemoveOpen(false);
            setRemoveAdaptationError(null);
          }
        }}
        size="sm"
      >
        <DialogTitle>Aangepaste versie verwijderen?</DialogTitle>
        <DialogDescription>
          Het recept wordt teruggezet naar de originele versie. Deze actie kun
          je niet ongedaan maken.
        </DialogDescription>
        <DialogBody>
          {removeAdaptationError && (
            <Text className="text-sm text-red-600 dark:text-red-400 mb-4">
              {removeAdaptationError}
            </Text>
          )}
        </DialogBody>
        <DialogActions>
          <Button
            outline
            onClick={() => {
              setConfirmRemoveOpen(false);
              setRemoveAdaptationError(null);
            }}
            disabled={isRemovingAdaptation}
          >
            Annuleren
          </Button>
          <Button
            color="red"
            disabled={isRemovingAdaptation}
            onClick={async () => {
              setIsRemovingAdaptation(true);
              setRemoveAdaptationError(null);
              const result = await removeRecipeAdaptationAction({
                recipeId: mealId,
              });
              setIsRemovingAdaptation(false);
              if (result.ok) {
                setConfirmRemoveOpen(false);
                setHasAppliedAdaptation(false);
                onRecipeApplied?.();
              } else {
                setRemoveAdaptationError(result.error.message);
              }
            }}
          >
            {isRemovingAdaptation ? 'Bezig…' : 'Verwijderen'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Recept verwijderen – onderaan de pagina */}
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10 border-t border-zinc-200 dark:border-zinc-800">
        <Button
          outline
          disabled={isDeletingRecipe}
          onClick={() => {
            setDeleteRecipeError(null);
            setDeleteRecipeDialogOpen(true);
          }}
          className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <TrashIcon className="h-4 w-4" />
          Recept verwijderen
        </Button>
      </div>

      <ConfirmDialog
        open={deleteRecipeDialogOpen}
        onClose={() => {
          if (!isDeletingRecipe) {
            setDeleteRecipeDialogOpen(false);
            setDeleteRecipeError(null);
          }
        }}
        onConfirm={async () => {
          setIsDeletingRecipe(true);
          setDeleteRecipeError(null);
          const result = await deleteMealAction({
            mealId,
            source: mealSource,
          });
          if (result.ok) {
            setDeleteRecipeDialogOpen(false);
            router.push('/recipes');
          } else {
            setDeleteRecipeError(result.error.message);
          }
          setIsDeletingRecipe(false);
        }}
        title="Recept verwijderen"
        description={`Weet je zeker dat je het recept "${mealName}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`}
        confirmLabel="Verwijderen"
        confirmColor="red"
        error={deleteRecipeError}
        isLoading={isDeletingRecipe}
      />

      {/* AI Magician Dialog */}
      <RecipeAIMagician
        open={aiMagicianOpen}
        onClose={() => setAiMagicianOpen(false)}
        recipeId={mealId}
        recipeName={mealName}
        onApplied={onRecipeApplied}
      />

      {/* Notification toast na verwijderen ingrediënt */}
      {removeIngredientNotification && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="text-sm font-medium text-zinc-900 dark:text-white">
            {removeIngredientNotification.message}
          </p>
          <button
            type="button"
            onClick={() => setRemoveIngredientNotification(null)}
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Melding sluiten"
          >
            <span className="sr-only">Sluiten</span>
            <span aria-hidden>×</span>
          </button>
        </div>
      )}
    </div>
  );
}
