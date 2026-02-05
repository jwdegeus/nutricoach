'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/src/components/app/ToastContext';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Link } from '@/components/catalyst/link';
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
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid';
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
  const { showToast } = useToast();
  const [isStartingReview, setIsStartingReview] = useState(false);
  const [isApplyingDraft, setIsApplyingDraft] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRegeneratingDay, setIsRegeneratingDay] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Extract available dates from plan
  const availableDates = plan.days.map((day) => day.date).sort();

  // Compact datumlabel voor Regenereren-dag listbox (bijv. "ma 4 feb")
  const formatShortDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  const handleStartReview = async () => {
    setIsStartingReview(true);
    setError(null);
    setErrorCode(null);
    setErrorDetails(null);
    onGuardrailsViolation?.(null);

    try {
      const result = await startMealPlanReviewAction({ planId });

      if (result.ok) {
        showToast({ type: 'success', title: 'Review gestart' });
        router.refresh();
      } else {
        setErrorCode(result.error.code);
        setError(result.error.message);
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details &&
          'reasonCodes' in result.error.details
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
    setErrorDetails(null);
    onGuardrailsViolation?.(null);

    try {
      const result = await applyMealPlanDraftAction({ planId });

      if (result.ok) {
        showToast({ type: 'success', title: 'Draft toegepast' });
        router.refresh();
      } else {
        setErrorCode(result.error.code);
        setError(result.error.message);
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details &&
          'reasonCodes' in result.error.details
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
    setErrorDetails(null);
    onGuardrailsViolation?.(null);

    try {
      const result = await regenerateMealPlanAction({ planId });

      if (result.ok) {
        showToast({ type: 'success', title: 'Weekmenu regeneratie gestart' });
        router.refresh();
        router.push(`/meal-plans/${planId}/shopping`);
      } else {
        // Check for guardrails violation
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details &&
          'reasonCodes' in result.error.details
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
          setErrorCode(result.error.code);
          setError(result.error.message);
          setErrorDetails(
            'details' in result.error &&
              result.error.details &&
              typeof result.error.details === 'object' &&
              !Array.isArray(result.error.details)
              ? (result.error.details as Record<string, unknown>)
              : null,
          );
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
    setErrorDetails(null);
    onGuardrailsViolation?.(null);

    try {
      const result = await regenerateMealPlanAction({
        planId,
        onlyDate: selectedDate,
      });

      if (result.ok) {
        showToast({ type: 'success', title: 'Dag regeneratie gestart' });
        router.refresh();
      } else {
        // Check for guardrails violation
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details &&
          'reasonCodes' in result.error.details
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
          setErrorCode(result.error.code);
          setError(result.error.message);
          setErrorDetails(
            'details' in result.error &&
              result.error.details &&
              typeof result.error.details === 'object' &&
              !Array.isArray(result.error.details)
              ? (result.error.details as Record<string, unknown>)
              : null,
          );
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
        setShowDeleteDialog(false);
        setError(null);
        showToast({ type: 'success', title: 'Weekmenu verwijderd' });
        window.dispatchEvent(new CustomEvent('meal-plan-changed'));
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
          setErrorCode(null);
          setErrorDetails(null);
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
                    {formatShortDate(date)}
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
                className="shrink-0"
              >
                {isRegeneratingDay ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Regenereren...
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-2" />
                    Regenereren dag
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Kies een dag en klik op Regenereren dag.
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

          {error && errorCode === 'INSUFFICIENT_ALLOWED_INGREDIENTS' && (
            <div
              className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon
                  className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
                  aria-hidden
                />
                <div className="flex-1 space-y-3">
                  <Text className="font-semibold text-red-900 dark:text-red-100">
                    Te weinig toegestane ingrediënten
                  </Text>
                  <Text className="text-sm text-red-700 dark:text-red-300">
                    Je dieetregels en uitsluitingen zijn momenteel zo streng dat
                    er niet genoeg ingrediënten overblijven om een weekmenu te
                    bouwen.
                    {errorDetails?.retryReason === 'POOL_EMPTY' && (
                      <>
                        {' '}
                        Dit komt doordat de ingredient pools leeg zijn na
                        filtering.
                      </>
                    )}
                  </Text>
                  <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1">
                    <li>Verruim je dieetregels (Guardrails)</li>
                    <li>Verwijder enkele uitsluitingen of voorkeuren</li>
                    <li>
                      Voeg meer recepten of ingrediënten toe aan je database
                    </li>
                  </ul>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {plan.metadata?.dietKey && (
                      <Link
                        href={`/settings/diets/${plan.metadata.dietKey}/edit`}
                        className="text-sm font-medium text-red-800 dark:text-red-200 underline hover:no-underline"
                      >
                        Open dieetinstellingen
                      </Link>
                    )}
                    <Link
                      href="/admin/ingredients"
                      className="text-sm font-medium text-red-800 dark:text-red-200 underline hover:no-underline"
                    >
                      Ingrediënten beheren
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
          {error && errorCode === 'MEAL_PLAN_SANITY_FAILED' && (
            <div
              className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon
                  className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
                  aria-hidden
                />
                <div className="flex-1 space-y-3">
                  <Text className="font-semibold text-red-900 dark:text-red-100">
                    Weekmenu afgekeurd door kwaliteitscheck
                  </Text>
                  <Text className="text-sm text-red-700 dark:text-red-300">
                    Het gegenereerde plan bevatte één of meer onlogische of
                    onvolledige maaltijden. Probeer opnieuw te genereren, of
                    verruim je constraints zodat er betere combinaties mogelijk
                    zijn.
                  </Text>
                  {Array.isArray(errorDetails?.issues) &&
                    errorDetails.issues.length > 0 && (
                      <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1">
                        {errorDetails.issues
                          .slice(0, 3)
                          .map((item: Record<string, unknown>, idx: number) => {
                            const code =
                              typeof item.code === 'string' ? item.code : '';
                            const message =
                              typeof item.message === 'string'
                                ? item.message
                                : '';
                            const dateStr =
                              typeof item.date === 'string' ? item.date : '';
                            const prefix = dateStr
                              ? `(${formatShortDate(dateStr)}) `
                              : '';
                            return (
                              <li key={idx}>
                                {prefix}
                                {code ? `${code}: ` : ''}
                                {message || '—'}
                              </li>
                            );
                          })}
                        {errorDetails.issues.length > 3 && (
                          <li className="text-red-600 dark:text-red-400">
                            +{errorDetails.issues.length - 3} meer…
                          </li>
                        )}
                      </ul>
                    )}
                  <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1">
                    <li>
                      Klik op &apos;Regenereren volledig plan&apos; of
                      &apos;Regenereren dag&apos;.
                    </li>
                    <li>
                      Verruim je dieetregels (Guardrails) of verwijder enkele
                      uitsluitingen.
                    </li>
                    <li>
                      Voeg meer recepten of ingrediënten toe voor betere
                      variatie.
                    </li>
                  </ul>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {plan.metadata?.dietKey && (
                      <Link
                        href={`/settings/diets/${plan.metadata.dietKey}/edit`}
                        className="text-sm font-medium text-red-800 dark:text-red-200 underline hover:no-underline"
                      >
                        Open dieetinstellingen
                      </Link>
                    )}
                    <Link
                      href="/admin/ingredients"
                      className="text-sm font-medium text-red-800 dark:text-red-200 underline hover:no-underline"
                    >
                      Ingrediënten beheren
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
          {error &&
            errorCode !== 'INSUFFICIENT_ALLOWED_INGREDIENTS' &&
            errorCode !== 'MEAL_PLAN_SANITY_FAILED' && (
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
