"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/catalyst/button";
import { Plus, RefreshCw, Loader2 } from "lucide-react";
import { applyDirectPlanEditAction } from "../actions/planEdit.actions";
import type { PlanEdit } from "@/src/lib/agents/meal-planner/planEdit.types";

type QuickEditBarProps = {
  planId: string;
  date: string;
};

export function QuickEditBar({
  planId,
  date,
}: QuickEditBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleAddTussendoortje = () => {
    setError(null);
    startTransition(async () => {
      try {
        const edit: PlanEdit = {
          action: "ADD_SNACK",
          planId,
          date,
          mealSlot: "snack",
          userIntentSummary: `Tussendoortje toegevoegd aan ${date}`,
        };

        const result = await applyDirectPlanEditAction(edit);
        if (result.ok) {
          // Edit is now running in background, status indicator will show progress
          // No need to refresh immediately - status indicator will handle it
        } else {
          setError(result.error.message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fout bij toevoegen tussendoortje");
      }
    });
  };

  const handleRegenerateDay = () => {
    setError(null);
    startTransition(async () => {
      try {
        const edit: PlanEdit = {
          action: "REGENERATE_DAY",
          planId,
          date,
          userIntentSummary: `Dag ${date} opnieuw gegenereerd`,
        };

        const result = await applyDirectPlanEditAction(edit);
        if (result.ok) {
          // Edit is now running in background, status indicator will show progress
          // No need to refresh immediately - status indicator will handle it
        } else {
          setError(result.error.message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fout bij regenereren dag");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          outline
          size="sm"
          onClick={handleAddTussendoortje}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          Tussendoortje
        </Button>
        <Button
          outline
          size="sm"
          onClick={handleRegenerateDay}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1" />
          )}
          Regenereren
        </Button>
      </div>
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
