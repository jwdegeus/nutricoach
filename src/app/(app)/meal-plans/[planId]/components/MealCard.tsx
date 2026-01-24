"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { ArrowLeftRight, Trash2, Clock, Loader2 } from "lucide-react";
import type { MealPlanResponse } from "@/src/lib/diets";
import type { EnrichedMeal, CookPlanDay } from "@/src/lib/agents/meal-planner/mealPlannerEnrichment.types";
import { MealRating } from "./MealRating";
import { MealDetailDialog } from "./MealDetailDialog";
import { applyDirectPlanEditAction } from "../actions/planEdit.actions";
import type { PlanEdit } from "@/src/lib/agents/meal-planner/planEdit.types";

type MealCardProps = {
  planId: string;
  date: string;
  mealSlot: string;
  mealId: string;
  meal: MealPlanResponse["days"][0]["meals"][0];
  title?: string;
  summaryLines?: string[];
  prepTime?: number;
  cookTime?: number;
  macros?: MealPlanResponse["days"][0]["meals"][0]["estimatedMacros"];
  enrichedMeal?: EnrichedMeal;
  cookPlanDay?: CookPlanDay;
  nevoFoodNamesByCode: Record<string, string>;
};

export function MealCard({
  planId,
  date,
  mealSlot,
  mealId,
  meal,
  title,
  summaryLines = [],
  prepTime,
  cookTime,
  macros,
  enrichedMeal,
  cookPlanDay,
  nevoFoodNamesByCode,
}: MealCardProps) {
  const router = useRouter();
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSwap = () => {
    setError(null);
    startTransition(async () => {
      try {
        const edit: PlanEdit = {
          action: "REPLACE_MEAL",
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
        setError(err instanceof Error ? err.message : "Fout bij wisselen maaltijd");
      }
    });
  };

  const handleRemove = () => {
    if (showRemoveConfirm) {
      setError(null);
      startTransition(async () => {
        try {
          const edit: PlanEdit = {
            action: "REMOVE_MEAL",
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
          setError(err instanceof Error ? err.message : "Fout bij verwijderen maaltijd");
          setShowRemoveConfirm(false);
        }
      });
    } else {
      setShowRemoveConfirm(true);
    }
  };

  const formatMealSlot = (slot: string) => {
    const slotMap: Record<string, string> = {
      breakfast: "Ontbijt",
      lunch: "Lunch",
      dinner: "Diner",
      snack: "Snack",
      smoothie: "Smoothie",
    };
    return slotMap[slot] || slot;
  };

  return (
    <>
      <div 
        className="rounded-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10 cursor-pointer hover:ring-zinc-950/10 dark:hover:ring-white/20 transition-all"
        onClick={() => setShowDetailDialog(true)}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {formatMealSlot(mealSlot)}
            </div>
            <Heading level={3} className="mt-1">
              {title || "Geen titel"}
            </Heading>
          </div>
        </div>

      {/* Time info */}
      {(prepTime !== undefined || cookTime !== undefined) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
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
        <div className="mb-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {macros.calories !== undefined && (
              <div>
                <span className="text-muted-foreground">Calorieën:</span>{" "}
                <span className="font-medium">{Math.round(macros.calories)}</span>
              </div>
            )}
            {macros.protein !== undefined && (
              <div>
                <span className="text-muted-foreground">Eiwit:</span>{" "}
                <span className="font-medium">{Math.round(macros.protein)}g</span>
              </div>
            )}
            {macros.carbs !== undefined && (
              <div>
                <span className="text-muted-foreground">Koolhydraten:</span>{" "}
                <span className="font-medium">{Math.round(macros.carbs)}g</span>
              </div>
            )}
            {macros.fat !== undefined && (
              <div>
                <span className="text-muted-foreground">Vet:</span>{" "}
                <span className="font-medium">{Math.round(macros.fat)}g</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rating */}
      <div 
        className="mb-2 pt-2 border-t border-zinc-200 dark:border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <MealRating mealId={mealId} />
      </div>

      {/* Actions */}
      <div 
        className="flex flex-col gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-2">
          <Button
            outline
            onClick={handleSwap}
            disabled={isPending}
            className="flex-1"
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <ArrowLeftRight className="h-3 w-3 mr-1" />
            )}
            Wissel
          </Button>
          <Button
            outline
            onClick={handleRemove}
            disabled={isPending}
            className="flex-1"
            color="red"
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1" />
            )}
            {showRemoveConfirm ? "Bevestig" : "Verwijder"}
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
    />
    </>
  );
}
