"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/catalyst/button";
import { Listbox, ListboxOption } from "@/components/catalyst/listbox";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { ConfirmDialog } from "@/components/catalyst/confirm-dialog";
import { regenerateMealPlanAction, deleteMealPlanAction } from "../../actions/mealPlans.actions";
import { Loader2, RefreshCw, Calendar, Trash2 } from "lucide-react";
import Link from "next/link";
import type { MealPlanResponse } from "@/src/lib/diets";

type GuardrailsViolationState = {
  reasonCodes: string[];
  contentHash: string;
  rulesetVersion?: number;
  forceDeficits?: Array<{ categoryCode: string; categoryNameNl: string; minPerDay?: number; minPerWeek?: number }>;
};

type MealPlanActionsProps = {
  planId: string;
  plan: MealPlanResponse;
  onGuardrailsViolation?: (violation: GuardrailsViolationState | null) => void;
};

export function MealPlanActions({ planId, plan, onGuardrailsViolation }: MealPlanActionsProps) {
  const router = useRouter();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegeneratingDay, setIsRegeneratingDay] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Extract available dates from plan
  const availableDates = plan.days.map((day) => day.date).sort();

  const handleRegenerateFull = async () => {
    setIsRegenerating(true);
    setError(null);
    onGuardrailsViolation?.(null);

    try {
      const result = await regenerateMealPlanAction({ planId });

      if (result.ok) {
        // Refresh page to show updated plan
        router.refresh();
        // Navigate to shopping to see updated plan
        router.push(`/meal-plans/${planId}/shopping`);
      } else {
        // Check for guardrails violation
        if (result.error.code === "GUARDRAILS_VIOLATION" && result.error.details) {
          const d = result.error.details;
          onGuardrailsViolation?.({
            reasonCodes: d.reasonCodes,
            contentHash: d.contentHash,
            rulesetVersion: d.rulesetVersion,
            ...("forceDeficits" in d && Array.isArray(d.forceDeficits) && { forceDeficits: d.forceDeficits }),
          });
        } else {
          setError(result.error.message);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fout bij regenereren plan"
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRegenerateDay = async () => {
    if (!selectedDate) {
      setError("Selecteer eerst een datum");
      return;
    }

    setIsRegeneratingDay(true);
    setError(null);
    onGuardrailsViolation?.(null);

    try {
      const result = await regenerateMealPlanAction({
        planId,
        onlyDate: selectedDate,
      });

      if (result.ok) {
        // Refresh page to show updated plan
        router.refresh();
      } else {
        // Check for guardrails violation
        if (result.error.code === "GUARDRAILS_VIOLATION" && result.error.details) {
          const d = result.error.details;
          onGuardrailsViolation?.({
            reasonCodes: d.reasonCodes,
            contentHash: d.contentHash,
            rulesetVersion: d.rulesetVersion,
            ...("forceDeficits" in d && Array.isArray(d.forceDeficits) && { forceDeficits: d.forceDeficits }),
          });
        } else {
          setError(result.error.message);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fout bij regenereren dag"
      );
    } finally {
      setIsRegeneratingDay(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const result = await deleteMealPlanAction(planId);

      if (result.ok) {
        // Dispatch custom event to notify shopping cart
        window.dispatchEvent(new CustomEvent('meal-plan-changed'));
        // Navigate to meal plans list
        router.push("/meal-plans");
        router.refresh();
      } else {
        setError(result.error.message);
        setShowDeleteDialog(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fout bij verwijderen meal plan"
      );
      setShowDeleteDialog(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Meal Plan Verwijderen"
        description="Weet je zeker dat je dit meal plan wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt."
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isDeleting}
      />
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Heading>Acties</Heading>
        <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Button
            onClick={handleRegenerateFull}
            disabled={isRegenerating || isRegeneratingDay}
            className="w-full"
          >
            {isRegenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Regenereren...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenereren Volledig Plan
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Genereert het hele plan opnieuw met dezelfde instellingen
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Listbox
              value={selectedDate}
              onChange={setSelectedDate}
              disabled={isRegenerating || isRegeneratingDay}
              placeholder="Selecteer datum"
              className="flex-1"
            >
              {availableDates.map((date) => (
                <ListboxOption key={date} value={date}>
                  {new Date(date).toLocaleDateString("nl-NL", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </ListboxOption>
              ))}
            </Listbox>
            <Button
              onClick={handleRegenerateDay}
              disabled={isRegenerating || isRegeneratingDay || !selectedDate}
              outline
            >
              {isRegeneratingDay ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Regenereren van één specifieke dag
          </p>
        </div>

        <div className="pt-4 border-t">
          <Button
            onClick={() => setShowDeleteDialog(true)}
            disabled={isRegenerating || isRegeneratingDay || isDeleting}
            color="red"
            outline
            className="w-full"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Verwijderen
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Verwijder dit meal plan permanent
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
