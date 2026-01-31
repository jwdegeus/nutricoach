'use client';

import { Badge } from '@/components/catalyst/badge';
import { Text } from '@/components/catalyst/text';
import { ClockIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import Image from 'next/image';
import type { MealIngredientRef } from '@/src/lib/diets';

/** Meal prop: supports both CustomMealRecord (camelCase) and API/DB (snake_case) */
export type MealLike = Record<string, unknown> & {
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
};

type MealDetailProps = {
  meal: MealLike;
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
  const mealData = (meal.mealData ?? meal.meal_data) as
    | Record<string, unknown>
    | undefined;
  const mealName = String(meal.name ?? meal.mealName ?? meal.meal_name ?? '');
  const mealSlot = String(meal.mealSlot ?? meal.meal_slot ?? '');
  const sourceImageUrl = (meal.sourceImageUrl ?? meal.source_image_url) as
    | string
    | null
    | undefined;
  const aiAnalysis = (meal.aiAnalysis ?? meal.ai_analysis) as
    | Record<string, unknown>
    | undefined;
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
              <Badge color="zinc">{formatMealSlot(mealSlot || '')}</Badge>
            </div>
          </div>
        </div>

        {/* Source Image */}
        {sourceImageUrl && (
          <div className="relative mt-4 min-h-[200px] max-h-96 w-full">
            <Image
              src={sourceImageUrl}
              alt={mealName}
              fill
              className="rounded-lg object-contain"
              sizes="(max-width: 768px) 100vw, 512px"
              unoptimized
            />
          </div>
        )}

        {/* Basic Info */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {(mealData as { prepTime?: number })?.prepTime != null && (
            <div className="flex items-center gap-2">
              <ClockIcon className="h-4 w-4 text-zinc-500" />
              <span className="text-zinc-600 dark:text-zinc-400">
                Bereidingstijd:{' '}
                <span className="font-medium">
                  {(mealData as { prepTime?: number }).prepTime} minuten
                </span>
              </span>
            </div>
          )}

          {(mealData as { servings?: number })?.servings != null && (
            <div className="flex items-center gap-2">
              <UserGroupIcon className="h-4 w-4 text-zinc-500" />
              <span className="text-zinc-600 dark:text-zinc-400">
                Porties:{' '}
                <span className="font-medium">
                  {(mealData as { servings?: number }).servings}
                </span>
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

          {userRating != null && userRating !== '' && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-600 dark:text-zinc-400">
                Beoordeling:{' '}
                <span className="font-medium">{String(userRating)}/5 ⭐</span>
              </span>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
          {createdAt && <div>Toegevoegd: {formatDate(String(createdAt))}</div>}
          {firstConsumedAt && (
            <div>
              Eerst {mealSource === 'custom' ? 'geconsumeerd' : 'gebruikt'}:{' '}
              {formatDate(String(firstConsumedAt))}
            </div>
          )}
          {lastConsumedAt && (
            <div>
              Laatst {mealSource === 'custom' ? 'geconsumeerd' : 'gebruikt'}:{' '}
              {formatDate(String(lastConsumedAt))}
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
          {(() => {
            const instr = (aiAnalysis as { instructions?: unknown })
              .instructions;
            return instr && Array.isArray(instr) ? (
              <ol className="space-y-2 list-decimal list-inside text-sm text-zinc-600 dark:text-zinc-400">
                {instr.map((instruction: unknown, idx: number) => (
                  <li key={idx}>{String(instruction)}</li>
                ))}
              </ol>
            ) : instr ? (
              <Text className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
                {String(instr)}
              </Text>
            ) : (
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                Geen instructies beschikbaar
              </Text>
            );
          })()}
        </div>
      )}

      {/* Ingredients */}
      {(() => {
        const refs = (mealData as { ingredientRefs?: MealIngredientRef[] })
          ?.ingredientRefs;
        return refs && refs.length > 0 ? (
          <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-white mb-4">
              Ingrediënten
            </h3>
            <ul className="space-y-2 text-sm">
              {refs.map((ref: MealIngredientRef, idx: number) => {
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
        ) : null;
      })()}

      {/* Nutrition Info */}
      {(() => {
        const macros =
          (mealData as { estimatedMacros?: Record<string, unknown> })
            ?.estimatedMacros ??
          (mealData as { nutrition?: Record<string, unknown> })?.nutrition;
        if (!macros) return null;
        return (
          <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-white mb-4">
              Voedingswaarden
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {Number(macros.calories) > 0 && (
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Calorieën:
                  </span>{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {Math.round(Number(macros.calories))} kcal
                  </span>
                </div>
              )}
              {Number(macros.protein) > 0 && (
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Eiwit:
                  </span>{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {Math.round(Number(macros.protein))} g
                  </span>
                </div>
              )}
              {Number(macros.carbs) > 0 && (
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Koolhydraten:
                  </span>{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {Math.round(Number(macros.carbs))} g
                  </span>
                </div>
              )}
              {Number(macros.fat) > 0 && (
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Vet:</span>{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {Math.round(Number(macros.fat))} g
                  </span>
                </div>
              )}
              {Number(macros.saturatedFat) > 0 && (
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Verzadigd vet:
                  </span>{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {Math.round(Number(macros.saturatedFat))} g
                  </span>
                </div>
              )}
              {nutritionScore != null && (
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
        );
      })()}
    </div>
  );
}
