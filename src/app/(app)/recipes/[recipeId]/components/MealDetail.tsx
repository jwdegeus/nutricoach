'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { RecipeNotesEditor } from './RecipeNotesEditor';
import { ImageLightbox } from './ImageLightbox';
import { RecipeImageUpload } from './RecipeImageUpload';
import { RecipeSourceEditor } from './RecipeSourceEditor';
import { RecipeAIMagician } from './RecipeAIMagician';
import { RecipePrepTimeAndServingsEditor } from './RecipePrepTimeAndServingsEditor';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog';
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
import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';
import type { RecipeComplianceResult } from '../../actions/recipe-compliance.actions';

type MealDetailProps = {
  meal: CustomMealRecord | any;
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
};

export function MealDetail({
  meal,
  mealSource,
  nevoFoodNamesByCode,
  customFoodNamesById = {},
  complianceScore,
  onRecipeApplied,
  onIngredientMatched,
}: MealDetailProps) {
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

  const router = useRouter();

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
    getHasAppliedAdaptationAction({ recipeId: meal.id }).then((result) => {
      if (result.ok) {
        setHasAppliedAdaptation(result.data.hasAppliedAdaptation);
        setAdvisoryIntro(result.data.intro);
        setAdvisoryWhyThisWorks(result.data.whyThisWorks);
      } else {
        setHasAppliedAdaptation(false);
        setAdvisoryIntro(undefined);
        setAdvisoryWhyThisWorks(undefined);
      }
    });
  }, [meal?.id, meal?.updated_at ?? meal?.updatedAt]);

  const hasAdvisoryContent =
    hasAppliedAdaptation &&
    (Boolean(advisoryIntro?.trim()) ||
      (Array.isArray(advisoryWhyThisWorks) && advisoryWhyThisWorks.length > 0));

  // Get initial image URL from meal data
  const initialImageUrl = meal.sourceImageUrl || meal.source_image_url || null;
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [recipeSource, setRecipeSource] = useState<string | null>(
    meal.source || null,
  );

  // Update image URL when meal data changes
  useEffect(() => {
    const newImageUrl = meal.sourceImageUrl || meal.source_image_url || null;
    if (newImageUrl !== imageUrl) {
      console.log('[MealDetail] Image URL changed:', {
        old: imageUrl,
        new: newImageUrl,
        mealId: meal.id,
        sourceImageUrl: meal.sourceImageUrl,
        source_image_url: meal.source_image_url,
        mealKeys: Object.keys(meal),
      });
      queueMicrotask(() => setImageUrl(newImageUrl));
    }
  }, [meal.sourceImageUrl, meal.source_image_url, imageUrl, meal.id]);

  // Update recipe source when meal data changes
  useEffect(() => {
    const newSource = meal.source || null;
    if (newSource !== recipeSource) {
      console.log('Meal source changed:', {
        old: recipeSource,
        new: newSource,
      });
      queueMicrotask(() => setRecipeSource(newSource));
    }
  }, [meal.source, recipeSource]);

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
  const mealData = meal.mealData || meal.meal_data;
  const mealName = meal.name || meal.mealName || meal.meal_name;
  const mealSlot = meal.mealSlot || meal.meal_slot;
  const dietKey = meal.dietKey || meal.diet_key;
  const aiAnalysis = meal.aiAnalysis || meal.ai_analysis;
  const sourceUrl = meal.sourceUrl ?? meal.source_url ?? null;
  const mealDataOriginal =
    meal.mealDataOriginal ?? meal.meal_data_original ?? null;
  const aiAnalysisOriginal =
    meal.aiAnalysisOriginal ?? meal.ai_analysis_original ?? null;
  const hasOriginal =
    (mealDataOriginal &&
      (mealDataOriginal.ingredients?.length > 0 ||
        mealDataOriginal.ingredientRefs?.length > 0)) ||
    aiAnalysisOriginal?.instructions?.length > 0;
  const displayMealData =
    viewingOriginal && mealDataOriginal ? mealDataOriginal : mealData;
  const displayAiAnalysis =
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
    getRecipeNutritionSummaryAction({ mealId: meal.id, source: mealSource })
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
  }, [
    meal?.id,
    mealSource,
    hasIngredientsForNutrition,
    meal?.updated_at ?? meal?.updatedAt,
  ]);

  // Laad opgeslagen matches voor legacy-ingrediënten (recipe_ingredient_matches) zodat alleen twijfelgevallen het waarschuwingsicoon tonen.
  // Per ingrediënt proberen we meerdere mogelijke regels (volledige regel, naam+hoeveelheid+eenheid, alleen naam) zodat een eerder opgeslagen match uit een ander recept altijd wordt gevonden.
  const hasLegacyIngredientsOnly =
    (displayMealData?.ingredients?.length ?? 0) > 0 &&
    (displayMealData?.ingredientRefs?.length ?? 0) === 0;
  useEffect(() => {
    if (
      !meal?.id ||
      !hasLegacyIngredientsOnly ||
      !displayMealData?.ingredients
    ) {
      setResolvedLegacyMatches(null);
      return;
    }
    const ingredients = displayMealData.ingredients as any[];
    const lineOptionsPerIngredient = ingredients.map((ing: any) => {
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
    });
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
  }, [meal?.id, hasLegacyIngredientsOnly, displayMealData?.ingredients]);

  const handleLegacyIngredientConfirmed = useCallback(() => {
    if (onIngredientMatched) {
      onIngredientMatched();
      return;
    }
    onRecipeApplied?.();
    const ingredients = displayMealData?.ingredients as any[] | undefined;
    if (ingredients?.length) {
      const lineOptionsPerIngredient = ingredients.map((ing: any) => {
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
      });
      getResolvedIngredientMatchesAction(lineOptionsPerIngredient).then((r) => {
        if (r.ok) setResolvedLegacyMatches(r.data);
      });
    }
  }, [onIngredientMatched, onRecipeApplied, displayMealData?.ingredients]);

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
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10 overflow-hidden">
        <div className="flex flex-col gap-6 mb-4 md:flex-row md:items-start">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-zinc-950 dark:text-white mb-2">
              {mealName}
            </h2>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Badge color={mealSource === 'custom' ? 'blue' : 'zinc'}>
                {mealSource === 'custom' ? 'Custom' : 'Gemini'}
              </Badge>
              <Badge color="zinc">{formatMealSlot(mealSlot)}</Badge>
              {formatDietTypeName(dietKey) && (
                <Badge color="green" className="text-xs">
                  {formatDietTypeName(dietKey)}
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
                        : 'Schendt één of meer dieetregels'
                  }
                >
                  Compliance{' '}
                  {complianceScore.noRulesConfigured
                    ? 'N.v.t.'
                    : `${complianceScore.scorePercent}%`}
                </Badge>
              )}
              {recipeSource && (
                <Badge color="purple" className="text-xs">
                  {recipeSource}
                </Badge>
              )}
            </div>

            {/* Source Editor */}
            <div className="mt-3">
              <RecipeSourceEditor
                currentSource={recipeSource}
                mealId={meal.id}
                source={mealSource}
                onSourceUpdated={(newSource) => {
                  setRecipeSource(newSource);
                  // Refresh the page to show the updated source
                  window.location.reload();
                }}
              />
            </div>

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

          {/* Source Image Upload/Display - Right on desktop, below on mobile */}
          <div className="flex-shrink-0 w-full md:w-auto min-w-0 max-w-full">
            <RecipeImageUpload
              mealId={meal.id}
              source={mealSource}
              currentImageUrl={imageUrl}
              onImageUploaded={(url) => {
                setImageUrl(url);
                // Refresh the page to show the new image
                window.location.reload();
              }}
              onImageRemoved={() => {
                setImageUrl(null);
                // Refresh the page to remove the image
                window.location.reload();
              }}
              onImageClick={() => setLightboxOpen(true)}
            />
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
            currentPrepTime={mealData?.prepTime}
            currentServings={mealData?.servings}
            mealId={meal.id}
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

          {userRating && (
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
                        star <= userRating
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-zinc-300 dark:text-zinc-700 fill-zinc-300 dark:fill-zinc-700'
                      }`}
                    />
                  ))}
                </div>
                <span className="font-medium text-zinc-900 dark:text-white ml-1">
                  {userRating}/5
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
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white mb-4">
            Bereidingsinstructies
          </h3>
          {displayAiAnalysis?.instructions &&
          Array.isArray(displayAiAnalysis.instructions) ? (
            <ol className="space-y-2 list-decimal list-inside text-sm text-zinc-600 dark:text-zinc-400">
              {displayAiAnalysis.instructions.map(
                (instruction: any, idx: number) => {
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
            {/* Show ingredientRefs if available (new format) — klikbaar met nutriwaardes */}
            {displayMealData?.ingredientRefs &&
              displayMealData.ingredientRefs.length > 0 &&
              displayMealData.ingredientRefs.map((ref: any, idx: number) => {
                const name =
                  (ref.customFoodId && customFoodNamesById[ref.customFoodId]) ||
                  (ref.nevoCode != null &&
                    nevoFoodNamesByCode[String(ref.nevoCode)]) ||
                  ref.displayName ||
                  (ref.customFoodId
                    ? 'Eigen ingrediënt'
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
                  : Number.isFinite(nevoCode) && nevoCode > 0
                    ? { source: 'nevo' as const, nevoCode }
                    : null;
                return (
                  <li key={idx} className="text-zinc-600 dark:text-zinc-400">
                    <IngredientRowWithNutrition
                      displayName={name}
                      amountG={amountG}
                      quantityLabel={quantityLabel}
                      match={match}
                    />
                  </li>
                );
              })}
            {/* Show ingredients if available (legacy format) — klikbaar, suggesties + match opslaan */}
            {displayMealData?.ingredients &&
              displayMealData.ingredients.length > 0 &&
              displayMealData.ingredients.map((ing: any, idx: number) => {
                const name =
                  resolvedLegacyMatches?.[idx]?.displayName ??
                  (ing.name || ing.original_line || `Ingrediënt ${idx + 1}`);
                const quantity = ing.quantity ?? ing.amount;
                const numQty =
                  typeof quantity === 'number'
                    ? quantity
                    : typeof quantity === 'string'
                      ? parseFloat(quantity)
                      : undefined;
                const unit = (ing.unit ?? 'g')?.toString().trim() || 'g';
                const note = ing.note ?? ing.notes;
                const quantityLabel =
                  numQty != null ? `${numQty} ${unit}` : undefined;
                const amountG =
                  unit === 'g' && typeof numQty === 'number' && numQty > 0
                    ? numQty
                    : typeof numQty === 'number' && numQty > 0
                      ? quantityUnitToGrams(numQty, unit)
                      : 100;
                return (
                  <li key={idx} className="text-zinc-600 dark:text-zinc-400">
                    <IngredientRowWithNutrition
                      displayName={name}
                      amountG={amountG}
                      quantityLabel={quantityLabel}
                      quantity={numQty}
                      unit={unit}
                      note={note}
                      match={resolvedLegacyMatches?.[idx] ?? null}
                      mealId={meal.id}
                      mealSource={mealSource}
                      ingredientIndex={idx}
                      onConfirmed={handleLegacyIngredientConfirmed}
                      externalSaving={savingIngredientMatch}
                      onSavingChange={setSavingIngredientMatch}
                    />
                  </li>
                );
              })}
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

      {/* Bewerk ingrediënten en bereiding (alleen actieve versie) */}
      {!viewingOriginal && (
        <RecipeContentEditor
          mealId={meal.id}
          mealSource={mealSource}
          ingredients={getIngredientsForEditor(mealData)}
          instructions={getInstructionsForEditor(aiAnalysis)}
          onUpdated={() => onRecipeApplied?.()}
        />
      )}

      {/* Notes Editor */}
      <RecipeNotesEditor
        initialContent={meal.notes || null}
        onSave={async (content) => {
          const result = await updateRecipeNotesAction({
            mealId: meal.id,
            source: mealSource,
            notes: content === '<p></p>' ? null : content,
          });
          if (!result.ok) {
            throw new Error(result.error.message);
          }
        }}
        mealId={meal.id}
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
                    (mealData.estimatedMacros || mealData.nutrition).calories,
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
                    (mealData.estimatedMacros || mealData.nutrition).protein,
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
                    (mealData.estimatedMacros || mealData.nutrition).carbs,
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
                    (mealData.estimatedMacros || mealData.nutrition).fat,
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
                    (mealData.estimatedMacros || mealData.nutrition)
                      .saturatedFat,
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
                  {Math.round(nutritionScore)}/100
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
                recipeId: meal.id,
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
            mealId: meal.id,
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
        recipeId={meal.id}
        recipeName={mealName}
        onApplied={onRecipeApplied}
      />
    </div>
  );
}
