'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/catalyst/badge';
import { Text } from '@/components/catalyst/text';
import { Button } from '@/components/catalyst/button';
import { StarIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { RecipeNotesEditor } from './RecipeNotesEditor';
import { ImageLightbox } from './ImageLightbox';
import { RecipeImageUpload } from './RecipeImageUpload';
import { RecipeSourceEditor } from './RecipeSourceEditor';
import { RecipeAIMagician } from './RecipeAIMagician';
import { RecipePrepTimeAndServingsEditor } from './RecipePrepTimeAndServingsEditor';
import { updateRecipeNotesAction } from '../../actions/meals.actions';
import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';
import type { RecipeComplianceResult } from '../../actions/recipe-compliance.actions';

type MealDetailProps = {
  meal: CustomMealRecord | any;
  mealSource: 'custom' | 'gemini';
  nevoFoodNamesByCode: Record<string, string>;
  /** Compliance score 0–100% volgens dieetregels */
  complianceScore?: RecipeComplianceResult | null;
  /** Wordt aangeroepen nadat AI Magician een aangepaste versie heeft toegepast, zodat de pagina kan verversen */
  onRecipeApplied?: () => void;
};

export function MealDetail({
  meal,
  mealSource,
  nevoFoodNamesByCode,
  complianceScore,
  onRecipeApplied,
}: MealDetailProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [aiMagicianOpen, setAiMagicianOpen] = useState(false);

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
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="flex items-start gap-6 mb-4">
          <div className="flex-1">
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

            {/* AI Magician Button */}
            <div className="mt-4">
              <Button onClick={() => setAiMagicianOpen(true)}>
                <SparklesIcon data-slot="icon" />
                AI Magician
              </Button>
            </div>
          </div>

          {/* Source Image Upload/Display - Right aligned */}
          <div className="flex-shrink-0">
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
      </div>

      {/* AI Analysis / Instructions */}
      {aiAnalysis && (
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white mb-4">
            Bereidingsinstructies
          </h3>
          {aiAnalysis.instructions && Array.isArray(aiAnalysis.instructions) ? (
            <ol className="space-y-2 list-decimal list-inside text-sm text-zinc-600 dark:text-zinc-400">
              {aiAnalysis.instructions.map((instruction: any, idx: number) => {
                // Handle both string format and object format {step, text}
                const instructionText =
                  typeof instruction === 'string'
                    ? instruction
                    : instruction?.text ||
                      instruction?.step ||
                      String(instruction);
                return <li key={idx}>{instructionText}</li>;
              })}
            </ol>
          ) : aiAnalysis.instructions ? (
            <Text className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
              {typeof aiAnalysis.instructions === 'string'
                ? aiAnalysis.instructions
                : String(aiAnalysis.instructions)}
            </Text>
          ) : (
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              Geen instructies beschikbaar
            </Text>
          )}
        </div>
      )}

      {/* Ingredients */}
      {((mealData?.ingredientRefs && mealData.ingredientRefs.length > 0) ||
        (mealData?.ingredients && mealData.ingredients.length > 0)) && (
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white mb-4">
            Ingrediënten
          </h3>
          <ul className="space-y-2 text-sm">
            {/* Show ingredientRefs if available (new format) */}
            {mealData?.ingredientRefs &&
              mealData.ingredientRefs.length > 0 &&
              mealData.ingredientRefs.map((ref: any, idx: number) => {
                const name =
                  ref.displayName ||
                  nevoFoodNamesByCode[ref.nevoCode] ||
                  `NEVO ${ref.nevoCode}`;
                return (
                  <li key={idx} className="text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {name}
                    </span>
                    : {ref.quantityG}g
                  </li>
                );
              })}
            {/* Show ingredients if available (legacy format from recipe import) */}
            {(!mealData?.ingredientRefs ||
              mealData.ingredientRefs.length === 0) &&
              mealData?.ingredients &&
              mealData.ingredients.length > 0 &&
              mealData.ingredients.map((ing: any, idx: number) => {
                const name =
                  ing.name || ing.original_line || `Ingrediënt ${idx + 1}`;
                const quantity = ing.quantity || ing.amount;
                const unit = ing.unit || 'g';
                const note = ing.note || ing.notes;
                return (
                  <li key={idx} className="text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {name}
                    </span>
                    {quantity && (
                      <>
                        : {quantity} {unit}
                      </>
                    )}
                    {note && (
                      <>
                        {' '}
                        <span className="text-zinc-500 dark:text-zinc-500">
                          ({note})
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
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
