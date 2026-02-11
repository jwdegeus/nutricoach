'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/catalyst/button';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Input } from '@/components/catalyst/input';
import { ArrowLeftRight, Trash2, Clock, Loader2, Replace } from 'lucide-react';
import type { MealPlanResponse } from '@/src/lib/diets';
import type {
  EnrichedMeal,
  CookPlanDay,
} from '@/src/lib/agents/meal-planner/mealPlannerEnrichment.types';
import type { MealPlanStatus } from '@/src/lib/meal-plans/mealPlans.types';
import { MealDetailDialog } from './MealDetailDialog';
import { applyDirectPlanEditAction } from '../actions/planEdit.actions';
import { updateMealPlanDraftSlotAction } from '../actions/planReview.actions';
import type { PlanEdit } from '@/src/lib/agents/meal-planner/planEdit.types';
import type { LinkedRecipe } from './MealPlanPageClient';

type MealCardProps = {
  planId: string;
  date: string;
  mealSlot: string;
  mealId: string;
  meal: MealPlanResponse['days'][0]['meals'][0];
  title?: string;
  summaryLines?: string[];
  prepTime?: number;
  cookTime?: number;
  macros?: MealPlanResponse['days'][0]['meals'][0]['estimatedMacros'];
  enrichedMeal?: EnrichedMeal;
  cookPlanDay?: CookPlanDay;
  nevoFoodNamesByCode: Record<string, string>;
  planStatus?: MealPlanStatus;
  /** Recept uit Recepten gekoppeld aan deze planmaaltijd (afbeelding, link) */
  linkedRecipe?: LinkedRecipe;
  /** Called when a per-meal edit (Wissel/Verwijder) is started */
  onEditStarted?: () => void;
};

export function MealCard({
  planId,
  date,
  mealSlot,
  mealId: _mealId,
  meal,
  title,
  summaryLines = [],
  prepTime,
  cookTime,
  macros,
  enrichedMeal,
  cookPlanDay,
  nevoFoodNamesByCode,
  planStatus,
  linkedRecipe,
  onEditStarted,
}: MealCardProps) {
  const router = useRouter();
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapForm, setSwapForm] = useState({
    name: '',
    nevoCode: '',
    quantityG: 100,
  });
  const [isSavingSwap, setIsSavingSwap] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapErrorCode, setSwapErrorCode] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleOpenSwapDialog = () => {
    setSwapForm({
      name: meal.name || '',
      nevoCode: meal.ingredientRefs?.[0]?.nevoCode?.toString() ?? '',
      quantityG: meal.ingredientRefs?.[0]?.quantityG ?? 100,
    });
    setSwapError(null);
    setSwapErrorCode(null);
    setShowSwapDialog(true);
  };

  const handleSaveSwap = async () => {
    const name = swapForm.name.trim();
    const nevoCode = swapForm.nevoCode.trim();
    const quantityG = Number(swapForm.quantityG);

    if (!name) {
      setSwapError('Vul een maaltijdnaam in');
      return;
    }
    if (!nevoCode) {
      setSwapError('Vul een NEVO-code in');
      return;
    }
    if (!Number.isFinite(quantityG) || quantityG < 1) {
      setSwapError('Gram moet minimaal 1 zijn');
      return;
    }

    setIsSavingSwap(true);
    setSwapError(null);
    setSwapErrorCode(null);

    try {
      const mealIdNew =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `swap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const result = await updateMealPlanDraftSlotAction({
        planId,
        date,
        mealSlot: mealSlot as 'breakfast' | 'lunch' | 'dinner' | 'snack',
        meal: {
          id: mealIdNew,
          name,
          slot: mealSlot as 'breakfast' | 'lunch' | 'dinner' | 'snack',
          date,
          ingredientRefs: [
            {
              nevoCode,
              quantityG,
              displayName: undefined,
              tags: undefined,
            },
          ],
        },
      });

      if (result.ok) {
        setShowSwapDialog(false);
        router.refresh();
      } else {
        setSwapErrorCode(result.error.code);
        setSwapError(result.error.message);
      }
    } catch (err) {
      setSwapError(
        err instanceof Error ? err.message : 'Fout bij vervangen maaltijd',
      );
    } finally {
      setIsSavingSwap(false);
    }
  };

  const handleSwap = () => {
    setError(null);
    startTransition(async () => {
      try {
        onEditStarted?.();
        const edit: PlanEdit = {
          action: 'REPLACE_MEAL',
          planId,
          date,
          mealSlot,
          userIntentSummary: `${mealSlot} op ${date} vervangen door alternatief`,
        };

        const result = await applyDirectPlanEditAction(edit);
        if (result.ok) {
          // Edit is now running in background, status indicator will show progress
          // No need to refresh immediately - status indicator will handle it
        } else {
          setError(result.error.message);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Fout bij wisselen maaltijd',
        );
      }
    });
  };

  const handleRemove = () => {
    if (showRemoveConfirm) {
      setError(null);
      startTransition(async () => {
        try {
          onEditStarted?.();
          const edit: PlanEdit = {
            action: 'REMOVE_MEAL',
            planId,
            date,
            mealSlot,
            userIntentSummary: `${mealSlot} verwijderd van ${date}`,
          };

          const result = await applyDirectPlanEditAction(edit);
          if (result.ok) {
            // Edit is now running in background, status indicator will show progress
            // No need to refresh immediately - status indicator will handle it
            setShowRemoveConfirm(false);
          } else {
            setError(result.error.message);
            setShowRemoveConfirm(false);
          }
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Fout bij verwijderen maaltijd',
          );
          setShowRemoveConfirm(false);
        }
      });
    } else {
      setShowRemoveConfirm(true);
    }
  };

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

  return (
    <>
      <div
        className="cursor-pointer rounded-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 transition-all hover:ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10 dark:hover:ring-white/20"
        onClick={() => setShowDetailDialog(true)}
      >
        {linkedRecipe?.imageUrl && (
          <div className="-mx-4 -mt-4 mb-3 aspect-[16/10] overflow-hidden rounded-t-lg bg-zinc-100 dark:bg-zinc-800">
            <img
              src={linkedRecipe.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="mb-2 flex items-start justify-between">
          <div className="flex-1">
            <div className="text-xs tracking-wide text-muted-foreground uppercase">
              {formatMealSlot(mealSlot)}
            </div>
            <Heading level={3} className="mt-1">
              {title || 'Geen titel'}
            </Heading>
          </div>
        </div>

        {/* Time info */}
        {(prepTime !== undefined || cookTime !== undefined) && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {prepTime !== undefined && cookTime !== undefined && (
              <span>
                {prepTime} min prep + {cookTime} min koken
              </span>
            )}
            {prepTime !== undefined && cookTime === undefined && (
              <span>{prepTime} min prep</span>
            )}
            {prepTime === undefined && cookTime !== undefined && (
              <span>{cookTime} min koken</span>
            )}
          </div>
        )}

        {/* Summary lines */}
        {summaryLines.length > 0 && (
          <div className="mb-3 space-y-1">
            {summaryLines.map((line, idx) => (
              <Text key={idx} className="text-sm text-muted-foreground">
                {line}
              </Text>
            ))}
          </div>
        )}

        {/* Macros (if available) */}
        {macros && (
          <div className="mb-3 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {macros.calories !== undefined && (
                <div>
                  <span className="text-muted-foreground">Calorieën:</span>{' '}
                  <span className="font-medium">
                    {Math.round(macros.calories)}
                  </span>
                </div>
              )}
              {macros.protein !== undefined && (
                <div>
                  <span className="text-muted-foreground">Eiwit:</span>{' '}
                  <span className="font-medium">
                    {Math.round(macros.protein)}g
                  </span>
                </div>
              )}
              {macros.carbs !== undefined && (
                <div>
                  <span className="text-muted-foreground">Koolhydraten:</span>{' '}
                  <span className="font-medium">
                    {Math.round(macros.carbs)}g
                  </span>
                </div>
              )}
              {macros.fat !== undefined && (
                <div>
                  <span className="text-muted-foreground">Vet:</span>{' '}
                  <span className="font-medium">{Math.round(macros.fat)}g</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div
          className="flex flex-col gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-2">
            {planStatus === 'draft' ? (
              <Button
                outline
                onClick={handleOpenSwapDialog}
                disabled={isPending}
                className="flex-1"
              >
                <Replace className="mr-1 h-3 w-3" />
                Swap
              </Button>
            ) : (
              <Button
                outline
                onClick={handleSwap}
                disabled={isPending}
                className="flex-1"
              >
                {isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <ArrowLeftRight className="mr-1 h-3 w-3" />
                )}
                Wissel
              </Button>
            )}
            <Button
              outline
              onClick={handleRemove}
              disabled={isPending}
              className="flex-1"
            >
              {isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3 w-3" />
              )}
              {showRemoveConfirm ? 'Bevestig' : 'Verwijder'}
            </Button>
          </div>
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Detail Dialog */}
      <MealDetailDialog
        open={showDetailDialog}
        onClose={() => setShowDetailDialog(false)}
        meal={meal}
        enrichedMeal={enrichedMeal}
        cookPlanDay={cookPlanDay}
        nevoFoodNamesByCode={nevoFoodNamesByCode}
        planId={planId}
        linkedRecipe={linkedRecipe}
      />

      {/* Swap (draft) Dialog */}
      <Dialog
        open={showSwapDialog}
        onClose={() => !isSavingSwap && setShowSwapDialog(false)}
        size="md"
      >
        <DialogTitle>Maaltijd vervangen</DialogTitle>
        <DialogDescription>
          Vervang deze maaltijd in de draft. Na opslaan wordt de draft
          gecontroleerd op dieetregels.
        </DialogDescription>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Nieuwe maaltijdnaam</Label>
              <Input
                type="text"
                value={swapForm.name}
                onChange={(e) =>
                  setSwapForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="bijv. Griekse salade"
                disabled={isSavingSwap}
              />
            </Field>
            <Field>
              <Label>Ingrediënt (NEVO-code)</Label>
              <Input
                type="text"
                value={swapForm.nevoCode}
                onChange={(e) =>
                  setSwapForm((prev) => ({ ...prev, nevoCode: e.target.value }))
                }
                placeholder="bijv. 1234"
                disabled={isSavingSwap}
              />
            </Field>
            <Field>
              <Label>Gram</Label>
              <Input
                type="number"
                min={1}
                value={swapForm.quantityG}
                onChange={(e) =>
                  setSwapForm((prev) => ({
                    ...prev,
                    quantityG: parseInt(e.target.value, 10) || 0,
                  }))
                }
                disabled={isSavingSwap}
              />
            </Field>
            {swapError && (
              <div
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
                role="alert"
              >
                <p className="font-medium">
                  {swapErrorCode === 'GUARDRAILS_VIOLATION'
                    ? 'Draft schendt dieetregels'
                    : 'Fout'}
                </p>
                <p className="mt-1">{swapError}</p>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button
            plain
            onClick={() => !isSavingSwap && setShowSwapDialog(false)}
            disabled={isSavingSwap}
          >
            Annuleren
          </Button>
          <Button onClick={handleSaveSwap} disabled={isSavingSwap}>
            {isSavingSwap ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opslaan...
              </>
            ) : (
              'Opslaan'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
