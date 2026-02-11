'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import {
  Clock,
  UtensilsCrossed,
  ChefHat,
  BookMarked,
  Loader2,
} from 'lucide-react';
import type { MealPlanResponse } from '@/src/lib/diets';
import type {
  EnrichedMeal,
  CookPlanDay,
} from '@/src/lib/agents/meal-planner/mealPlannerEnrichment.types';
import { Text } from '@/components/catalyst/text';
import { useToast } from '@/src/components/app/ToastContext';
import { addMealToRecipesAction } from '../actions/addMealToRecipes.actions';
import { MealRating } from './MealRating';
import type { LinkedRecipe } from './MealPlanPageClient';

type MealDetailDialogProps = {
  open: boolean;
  onClose: () => void;
  meal: MealPlanResponse['days'][0]['meals'][0];
  enrichedMeal?: EnrichedMeal;
  cookPlanDay?: CookPlanDay;
  nevoFoodNamesByCode: Record<string, string>;
  /** When set, shows "Toevoegen aan recepten" to save this meal to the recipes database */
  planId?: string;
  /** When set, this meal was already added to recipes; show link and optional image */
  linkedRecipe?: LinkedRecipe;
};

export function MealDetailDialog({
  open,
  onClose,
  meal,
  enrichedMeal,
  cookPlanDay,
  nevoFoodNamesByCode,
  planId,
  linkedRecipe,
}: MealDetailDialogProps) {
  const { showToast } = useToast();
  const [addingToRecipes, setAddingToRecipes] = useState(false);
  const [addedRecipeId, setAddedRecipeId] = useState<string | null>(null);
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleAddToRecipes = async () => {
    if (!planId) return;
    setAddingToRecipes(true);
    setAddedRecipeId(null);
    try {
      const result = await addMealToRecipesAction({
        planId,
        meal,
        enrichedMeal: enrichedMeal ?? null,
        nevoFoodNamesByCode,
      });
      if (result.ok) {
        setAddedRecipeId(result.recipeId);
        showToast({
          type: 'success',
          title: 'Recept toegevoegd',
          description: 'Het recept staat nu in je receptenoverzicht.',
        });
      } else {
        showToast({ type: 'error', title: result.error.message });
      }
    } finally {
      setAddingToRecipes(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>{enrichedMeal?.title || meal.name}</DialogTitle>
      <DialogDescription>
        {formatMealSlot(meal.slot)} • {formatDate(meal.date)}
      </DialogDescription>

      <DialogBody className="space-y-6">
        {linkedRecipe?.imageUrl && (
          <div className="aspect-video overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <img
              src={linkedRecipe.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}
        {/* Enrichment Info */}
        {enrichedMeal ? (
          <>
            {/* Tijd informatie */}
            {(enrichedMeal.prepTimeMin > 0 || enrichedMeal.cookTimeMin > 0) && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white">
                  <Clock className="h-4 w-4" />
                  Bereidingstijd
                </div>
                <div className="space-y-1 pl-6 text-sm text-zinc-600 dark:text-zinc-400">
                  {enrichedMeal.prepTimeMin > 0 && (
                    <div>Voorbereiding: {enrichedMeal.prepTimeMin} minuten</div>
                  )}
                  {enrichedMeal.cookTimeMin > 0 && (
                    <div>Kooktijd: {enrichedMeal.cookTimeMin} minuten</div>
                  )}
                  {enrichedMeal.prepTimeMin > 0 &&
                    enrichedMeal.cookTimeMin > 0 && (
                      <div className="font-medium text-zinc-900 dark:text-white">
                        Totaal:{' '}
                        {enrichedMeal.prepTimeMin + enrichedMeal.cookTimeMin}{' '}
                        minuten
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Porties */}
            {enrichedMeal.servings && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-zinc-900 dark:text-white">
                  Porties
                </div>
                <div className="pl-6 text-sm text-zinc-600 dark:text-zinc-400">
                  {enrichedMeal.servings}{' '}
                  {enrichedMeal.servings === 1 ? 'portie' : 'porties'}
                </div>
              </div>
            )}

            {/* Bereidingsinstructies */}
            {enrichedMeal.instructions &&
              enrichedMeal.instructions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white">
                    <UtensilsCrossed className="h-4 w-4" />
                    Bereidingsinstructies
                  </div>
                  <ol className="list-inside list-decimal space-y-2 pl-6">
                    {enrichedMeal.instructions.map((instruction, idx) => (
                      <li
                        key={idx}
                        className="text-sm text-zinc-600 dark:text-zinc-400"
                      >
                        {instruction}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

            {/* Keukennotities */}
            {enrichedMeal.kitchenNotes &&
              enrichedMeal.kitchenNotes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-zinc-900 dark:text-white">
                    Keukentips
                  </div>
                  <ul className="list-inside list-disc space-y-1 pl-6">
                    {enrichedMeal.kitchenNotes.map((note, idx) => (
                      <li
                        key={idx}
                        className="text-sm text-zinc-600 dark:text-zinc-400"
                      >
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </>
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            Geen enrichment beschikbaar voor deze maaltijd.
          </div>
        )}

        {/* Kookplan: alleen stappen die bij deze maaltijd horen, met bereidingstijd van deze maaltijd */}
        {cookPlanDay &&
          cookPlanDay.steps.length > 0 &&
          (() => {
            const mealTitle = (enrichedMeal?.title || meal.name || '').trim();
            const stepsForThisMeal = mealTitle
              ? cookPlanDay.steps.filter((step) =>
                  step.toLowerCase().includes(mealTitle.toLowerCase()),
                )
              : [];
            const showMealOnly = stepsForThisMeal.length > 0 && enrichedMeal;
            const totalMin =
              enrichedMeal &&
              (enrichedMeal.prepTimeMin > 0 || enrichedMeal.cookTimeMin > 0)
                ? enrichedMeal.prepTimeMin + enrichedMeal.cookTimeMin
                : 0;
            return (
              <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white">
                  <ChefHat className="h-4 w-4" />
                  {showMealOnly
                    ? `Kookplan voor deze maaltijd`
                    : `Kookplan voor ${formatDate(cookPlanDay.date)}`}
                </div>
                <ul className="list-inside list-disc space-y-2 pl-6">
                  {(showMealOnly ? stepsForThisMeal : cookPlanDay.steps).map(
                    (step, idx) => (
                      <li
                        key={idx}
                        className="text-sm text-zinc-600 dark:text-zinc-400"
                      >
                        {step}
                      </li>
                    ),
                  )}
                </ul>
                {showMealOnly && totalMin > 0 ? (
                  <div className="pl-6 text-sm font-medium text-zinc-900 dark:text-white">
                    Geschatte tijd voor deze maaltijd: {totalMin} minuten
                  </div>
                ) : (
                  cookPlanDay.estimatedTotalTimeMin > 0 && (
                    <div className="pl-6 text-sm font-medium text-zinc-900 dark:text-white">
                      Geschatte totale tijd: {cookPlanDay.estimatedTotalTimeMin}{' '}
                      minuten
                    </div>
                  )
                )}
              </div>
            );
          })()}

        {/* Ingrediënten */}
        {meal.ingredientRefs && meal.ingredientRefs.length > 0 && (
          <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="text-sm font-medium text-zinc-900 dark:text-white">
              Ingrediënten
            </div>
            <ul className="list-inside list-disc space-y-1 pl-6">
              {meal.ingredientRefs.map((ref, idx) => {
                const name =
                  ref.displayName ||
                  nevoFoodNamesByCode[ref.nevoCode] ||
                  `NEVO ${ref.nevoCode}`;
                return (
                  <li
                    key={idx}
                    className="text-sm text-zinc-600 dark:text-zinc-400"
                  >
                    {name}: {ref.quantityG}g
                  </li>
                );
              })}
            </ul>
            {(() => {
              const title = (
                enrichedMeal?.title ||
                meal.name ||
                ''
              ).toLowerCase();
              const isShake =
                /eiwit.*(shake|smoothie)|(shake|smoothie).*eiwit/.test(title) ||
                /\beiwitshake\b/.test(title);
              const hasProteinPowder = meal.ingredientRefs.some((ref) => {
                const n = (
                  ref.displayName ||
                  nevoFoodNamesByCode[ref.nevoCode] ||
                  ''
                ).toLowerCase();
                return /eiwitpoeder|rijsteiwitpoeder|ei-eiwitpoeder|protein.*poeder/.test(
                  n,
                );
              });
              if (isShake && !hasProteinPowder) {
                return (
                  <p className="pl-6 text-sm text-zinc-500 italic dark:text-zinc-500">
                    Optioneel: rijsteiwitpoeder of ei-eiwitpoeder (niet in plan)
                  </p>
                );
              }
              return null;
            })()}
          </div>
        )}

        {/* Voedingswaarden */}
        {meal.estimatedMacros && (
          <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="text-sm font-medium text-zinc-900 dark:text-white">
              Voedingswaarden (geschat)
            </div>
            <div className="grid grid-cols-2 gap-2 pl-6 text-sm">
              {meal.estimatedMacros.calories !== undefined && (
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Calorieën:
                  </span>{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {Math.round(meal.estimatedMacros.calories)} kcal
                  </span>
                </div>
              )}
              {meal.estimatedMacros.protein !== undefined && (
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Eiwit:
                  </span>{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {Math.round(meal.estimatedMacros.protein)}g
                  </span>
                </div>
              )}
              {meal.estimatedMacros.carbs !== undefined && (
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Koolhydraten:
                  </span>{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {Math.round(meal.estimatedMacros.carbs)}g
                  </span>
                </div>
              )}
              {meal.estimatedMacros.fat !== undefined && (
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Vet:</span>{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {Math.round(meal.estimatedMacros.fat)}g
                  </span>
                </div>
              )}
              {meal.estimatedMacros.saturatedFat !== undefined && (
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Verzadigd vet:
                  </span>{' '}
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {Math.round(meal.estimatedMacros.saturatedFat)}g
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Beoordeel maaltijd */}
        <div className="space-y-2 border-t border-border pt-4">
          <Text className="text-sm font-medium text-foreground">
            Beoordeel maaltijd
          </Text>
          <Text className="text-xs text-muted-foreground">
            Gebruik sterren om deze maaltijd te markeren voor
            hergebruik/voorkeur.
          </Text>
          <MealRating mealId={meal.id} className="mt-2" />
        </div>
      </DialogBody>

      <DialogActions>
        {(planId || linkedRecipe) && (
          <>
            {linkedRecipe ? (
              <Button
                color="primary"
                href={`/recipes/${linkedRecipe.recipeId}`}
              >
                <BookMarked className="h-4 w-4" />
                Bekijk in recepten
              </Button>
            ) : addedRecipeId ? (
              <Button color="green" href={`/recipes/${addedRecipeId}`}>
                <BookMarked className="h-4 w-4" />
                Naar recept
              </Button>
            ) : planId ? (
              <Button
                plain
                onClick={handleAddToRecipes}
                disabled={addingToRecipes}
              >
                {addingToRecipes ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <BookMarked className="h-4 w-4" />
                )}
                Toevoegen aan recepten
              </Button>
            ) : null}
          </>
        )}
        <Button onClick={onClose}>Sluiten</Button>
      </DialogActions>
    </Dialog>
  );
}
