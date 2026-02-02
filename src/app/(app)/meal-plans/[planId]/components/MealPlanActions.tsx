'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { Heading } from '@/components/catalyst/heading';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import {
  regenerateMealPlanAction,
  deleteMealPlanAction,
} from '../../actions/mealPlans.actions';
import {
  startMealPlanReviewAction,
  applyMealPlanDraftAction,
} from '../actions/planReview.actions';
import {
  Loader2,
  RefreshCw,
  Calendar,
  Trash2,
  PenSquare,
  CheckCircle,
} from 'lucide-react';
import type { MealPlanResponse } from '@/src/lib/diets';
import type { MealPlanStatus } from '@/src/lib/meal-plans/mealPlans.types';

type GuardrailsViolationState = {
  reasonCodes: string[];
  contentHash: string;
  rulesetVersion?: number;
  forceDeficits?: Array<{
    categoryCode: string;
    categoryNameNl: string;
    minPerDay?: number;
    minPerWeek?: number;
  }>;
};

type MealPlanActionsProps = {
  planId: string;
  plan: MealPlanResponse;
  planStatus?: MealPlanStatus;
  onGuardrailsViolation?: (violation: GuardrailsViolationState | null) => void;
};

export function MealPlanActions({
  planId,
  plan,
  planStatus,
  onGuardrailsViolation,
}: MealPlanActionsProps) {
  const router = useRouter();
  const [isStartingReview, setIsStartingReview] = useState(false);
  const [isApplyingDraft, setIsApplyingDraft] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegeneratingDay, setIsRegeneratingDay] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Extract available dates from plan
  const availableDates = plan.days.map((day) => day.date).sort();

  const handleStartReview = async () => {
    setIsStartingReview(true);
    setError(null);
    setErrorCode(null);
    onGuardrailsViolation?.(null);

    try {
      const result = await startMealPlanReviewAction({ planId });

      if (result.ok) {
        router.refresh();
      } else {
        setErrorCode(result.error.code);
        setError(result.error.message);
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details
        ) {
          const d = result.error.details;
          onGuardrailsViolation?.({
            reasonCodes: d.reasonCodes,
            contentHash: d.contentHash ?? '',
            rulesetVersion: d.rulesetVersion,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij starten review');
    } finally {
      setIsStartingReview(false);
    }
  };

  const handleApplyDraft = async () => {
    setIsApplyingDraft(true);
    setError(null);
    setErrorCode(null);
    onGuardrailsViolation?.(null);

    try {
      const result = await applyMealPlanDraftAction({ planId });

      if (result.ok) {
        router.refresh();
      } else {
        setErrorCode(result.error.code);
        setError(result.error.message);
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details
        ) {
          const d = result.error.details;
          onGuardrailsViolation?.({
            reasonCodes: d.reasonCodes,
            contentHash: d.contentHash ?? '',
            rulesetVersion: d.rulesetVersion,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij toepassen draft');
    } finally {
      setIsApplyingDraft(false);
    }
  };

  const handleRegenerateFull = async () => {
    setIsRegenerating(true);
    setError(null);
    setErrorCode(null);
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
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details
        ) {
          const d = result.error.details;
          onGuardrailsViolation?.({
            reasonCodes: d.reasonCodes,
            contentHash: d.contentHash,
            rulesetVersion: d.rulesetVersion,
            ...('forceDeficits' in d &&
              Array.isArray(d.forceDeficits) && {
                forceDeficits: d.forceDeficits,
              }),
          });
        } else {
          setError(result.error.message);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Fout bij regenereren plan',
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRegenerateDay = async () => {
    if (!selectedDate) {
      setError('Selecteer eerst een datum');
      return;
    }

    setIsRegeneratingDay(true);
    setError(null);
    setErrorCode(null);
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
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details
        ) {
          const d = result.error.details;
          onGuardrailsViolation?.({
            reasonCodes: d.reasonCodes,
            contentHash: d.contentHash,
            rulesetVersion: d.rulesetVersion,
            ...('forceDeficits' in d &&
              Array.isArray(d.forceDeficits) && {
                forceDeficits: d.forceDeficits,
              }),
          });
        } else {
          setError(result.error.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij regenereren dag');
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
        router.push('/meal-plans');
        router.refresh();
      } else {
        setError(result.error.message);
        // Keep dialog open so user sees the error
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Fout bij verwijderen weekmenu',
      );
      // Keep dialog open so user sees the error
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setError(null);
        }}
        onConfirm={handleDelete}
        title="Weekmenu verwijderen"
        description="Weet je zeker dat je dit weekmenu wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt."
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isDeleting}
        error={error}
      />
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Heading>Acties</Heading>
          {planStatus === 'draft' && <Badge color="yellow">Draft</Badge>}
        </div>
        <div className="mt-4 space-y-4">
          {/* Review: start or apply draft */}
          {planStatus !== undefined && (
            <div className="space-y-2">
              {planStatus === 'draft' ? (
                <Button
                  onClick={handleApplyDraft}
                  disabled={
                    isApplyingDraft ||
                    isStartingReview ||
                    isRegenerating ||
                    isRegeneratingDay
                  }
                  className="w-full"
                >
                  {isApplyingDraft ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Bezig met toepassen...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Pas draft toe
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleStartReview}
                  disabled={
                    isStartingReview ||
                    isApplyingDraft ||
                    isRegenerating ||
                    isRegeneratingDay
                  }
                  outline
                  className="w-full"
                >
                  {isStartingReview ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Bezig met starten...
                    </>
                  ) : (
                    <>
                      <PenSquare className="h-4 w-4 mr-2" />
                      Start review
                    </>
                  )}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {planStatus === 'draft'
                  ? 'Maak dit weekmenu definitief na je aanpassingen'
                  : 'Open het plan als draft om aanpassingen te doen vóór toepassen'}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Button
              onClick={handleRegenerateFull}
              disabled={
                isRegenerating ||
                isRegeneratingDay ||
                isStartingReview ||
                isApplyingDraft
              }
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
                disabled={
                  isRegenerating ||
                  isRegeneratingDay ||
                  isStartingReview ||
                  isApplyingDraft
                }
                placeholder="Selecteer datum"
                className="flex-1"
              >
                {availableDates.map((date) => (
                  <ListboxOption key={date} value={date}>
                    {new Date(date).toLocaleDateString('nl-NL', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </ListboxOption>
                ))}
              </Listbox>
              <Button
                onClick={handleRegenerateDay}
                disabled={
                  isRegenerating ||
                  isRegeneratingDay ||
                  isStartingReview ||
                  isApplyingDraft ||
                  !selectedDate
                }
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
              onClick={() => {
                setError(null);
                setShowDeleteDialog(true);
              }}
              disabled={
                isRegenerating ||
                isRegeneratingDay ||
                isDeleting ||
                isStartingReview ||
                isApplyingDraft
              }
              outline
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Verwijderen
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Verwijder dit weekmenu permanent
            </p>
          </div>

          {error && (
            <div
              className="p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 text-red-800 dark:text-red-200 text-sm"
              role="alert"
            >
              <p className="font-medium">
                {errorCode === 'GUARDRAILS_VIOLATION'
                  ? 'Draft schendt dieetregels'
                  : 'Fout'}
              </p>
              <p className="mt-1">{error}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
