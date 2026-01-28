'use client';

import { Badge } from '@/components/catalyst/badge';
import { Text } from '@/components/catalyst/text';
import { ClockIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import type { CustomMealRecord } from '@/src/lib/custom-meals/customMeals.service';

type MealDetailProps = {
  meal: CustomMealRecord | any;
  mealSource: 'custom' | 'gemini';
  nevoFoodNamesByCode: Record<string, string>;
};

export function MealDetail({
  meal,
  mealSource,
  nevoFoodNamesByCode,
}: MealDetailProps) {
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
  const sourceImageUrl = meal.sourceImageUrl || meal.source_image_url;
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

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-950 dark:text-white mb-2">
              {mealName}
            </h2>
            <div className="flex items-center gap-3 mb-2">
              <Badge color={mealSource === 'custom' ? 'blue' : 'zinc'}>
                {mealSource === 'custom' ? 'Custom' : 'Gemini'}
              </Badge>
              <Badge color="zinc">{formatMealSlot(mealSlot)}</Badge>
            </div>
          </div>
        </div>

        {/* Source Image */}
        {sourceImageUrl && (
          <div className="mt-4">
            <img
              src={sourceImageUrl}
              alt={mealName}
              className="rounded-lg max-w-full h-auto max-h-96 object-contain"
            />
          </div>
        )}

        {/* Basic Info */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {mealData?.prepTime && (
            <div className="flex items-center gap-2">
              <ClockIcon className="h-4 w-4 text-zinc-500" />
              <span className="text-zinc-600 dark:text-zinc-400">
                Bereidingstijd:{' '}
                <span className="font-medium">{mealData.prepTime} minuten</span>
              </span>
            </div>
          )}

          {mealData?.servings && (
            <div className="flex items-center gap-2">
              <UserGroupIcon className="h-4 w-4 text-zinc-500" />
              <span className="text-zinc-600 dark:text-zinc-400">
                Porties:{' '}
                <span className="font-medium">{mealData.servings}</span>
              </span>
            </div>
          )}

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
                Beoordeling:{' '}
                <span className="font-medium">{userRating}/5 ⭐</span>
              </span>
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
              {aiAnalysis.instructions.map(
                (instruction: string, idx: number) => (
                  <li key={idx}>{instruction}</li>
                ),
              )}
            </ol>
          ) : aiAnalysis.instructions ? (
            <Text className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
              {aiAnalysis.instructions}
            </Text>
          ) : (
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              Geen instructies beschikbaar
            </Text>
          )}
        </div>
      )}

      {/* Ingredients */}
      {mealData?.ingredientRefs && mealData.ingredientRefs.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white mb-4">
            Ingrediënten
          </h3>
          <ul className="space-y-2 text-sm">
            {mealData.ingredientRefs.map((ref: any, idx: number) => {
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
          </ul>
        </div>
      )}

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
    </div>
  );
}
