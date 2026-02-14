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
import { deleteMealPlanAction } from '../../actions/mealPlans.actions';
import {
  startMealPlanReviewAction,
  applyMealPlanDraftAction,
} from '../actions/planReview.actions';
import {
  ArrowPathIcon,
  CalendarIcon,
  TrashIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/16/solid';
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
          const d = result.error.details as {
            reasonCodes: string[];
            contentHash?: string;
            rulesetVersion?: number;
          };
          onGuardrailsViolation?.({
            reasonCodes: Array.isArray(d.reasonCodes) ? d.reasonCodes : [],
            contentHash: typeof d.contentHash === 'string' ? d.contentHash : '',
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
          const d = result.error.details as {
            reasonCodes: string[];
            contentHash?: string;
            rulesetVersion?: number;
          };
          onGuardrailsViolation?.({
            reasonCodes: Array.isArray(d.reasonCodes) ? d.reasonCodes : [],
            contentHash: typeof d.contentHash === 'string' ? d.contentHash : '',
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
        // Replace so we leave the deleted plan URL; full navigation ensures the list is shown
        window.location.href = '/meal-plans';
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
      <div className="rounded-2xl bg-muted/20 p-6 shadow-sm">
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
                  disabled={isApplyingDraft || isStartingReview}
                  className="w-full"
                >
                  {isApplyingDraft ? (
                    <>
                      <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                      Bezig met toepassen...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="mr-2 h-4 w-4" />
                      Pas draft toe
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleStartReview}
                  disabled={isStartingReview || isApplyingDraft}
                  outline
                  className="w-full"
                >
                  {isStartingReview ? (
                    <>
                      <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                      Bezig met starten...
                    </>
                  ) : (
                    <>
                      <PencilSquareIcon className="mr-2 h-4 w-4" />
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
            <Button disabled className="w-full" title="Tijdelijk uitgeschakeld">
              <ArrowPathIcon className="mr-2 h-4 w-4" />
              Regenereren Volledig Plan
            </Button>
            <p className="text-xs text-muted-foreground">
              Regeneratie is tijdelijk uitgeschakeld. Binnenkort weer
              beschikbaar.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2">
              <Listbox
                value={selectedDate}
                onChange={setSelectedDate}
                disabled
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
                disabled
                outline
                className="shrink-0"
                title="Tijdelijk uitgeschakeld"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                Regenereren dag
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Regeneratie is tijdelijk uitgeschakeld.
            </p>
          </div>

          <div className="mt-4 pt-4">
            <Button
              onClick={() => {
                setError(null);
                setShowDeleteDialog(true);
              }}
              disabled={isDeleting || isStartingReview || isApplyingDraft}
              outline
              className="w-full"
            >
              <TrashIcon className="mr-2 h-4 w-4" />
              Verwijderen
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Verwijder dit weekmenu permanent
            </p>
          </div>

          {error && errorCode === 'INSUFFICIENT_ALLOWED_INGREDIENTS' && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
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
                  <ul className="list-inside list-disc space-y-1 text-sm text-red-700 dark:text-red-300">
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
                        className="text-sm font-medium text-red-800 underline hover:no-underline dark:text-red-200"
                      >
                        Open dieetinstellingen
                      </Link>
                    )}
                    <Link
                      href="/admin/ingredients"
                      className="text-sm font-medium text-red-800 underline hover:no-underline dark:text-red-200"
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
              className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
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
                      <ul className="list-inside list-disc space-y-1 text-sm text-red-700 dark:text-red-300">
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
                  <ul className="list-inside list-disc space-y-1 text-sm text-red-700 dark:text-red-300">
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
                        className="text-sm font-medium text-red-800 underline hover:no-underline dark:text-red-200"
                      >
                        Open dieetinstellingen
                      </Link>
                    )}
                    <Link
                      href="/admin/ingredients"
                      className="text-sm font-medium text-red-800 underline hover:no-underline dark:text-red-200"
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
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
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
