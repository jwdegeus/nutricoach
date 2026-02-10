'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/catalyst/button';
import { Link } from '@/components/catalyst/link';
import { Text } from '@/components/catalyst/text';
import {
  applyMealPlanDraftAction,
  cancelMealPlanReviewAction,
} from '../actions/planReview.actions';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/16/solid';

type ApplyError = {
  message: string;
  code?: string;
  details?: { householdRuleApplied?: boolean };
};

type ApplyWarning = {
  message: string;
  reasonCodes?: string[];
};

type MealPlanDraftBannerClientProps = {
  planId: string;
};

export function MealPlanDraftBannerClient({
  planId,
}: MealPlanDraftBannerClientProps) {
  const router = useRouter();
  const [applyLoading, setApplyLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<ApplyError | null>(null);
  const [applyWarning, setApplyWarning] = useState<ApplyWarning | null>(null);
  const [didApplySuccessfully, setDidApplySuccessfully] = useState(false);

  const handleApply = async () => {
    setApplyLoading(true);
    setError(null);
    setApplyWarning(null);
    setDidApplySuccessfully(false);
    try {
      const result = await applyMealPlanDraftAction({ planId });
      if (result.ok) {
        setDidApplySuccessfully(true);
        if (result.data?.warning?.warned === true) {
          const reasonCodes = Array.isArray(result.data.warning.reasonCodes)
            ? result.data.warning.reasonCodes.slice(0, 3)
            : undefined;
          setApplyWarning({
            message:
              'Dit weekmenu bevat items die mogelijk conflicteren met huishouden-voorkeuren (soft).',
            reasonCodes:
              reasonCodes && reasonCodes.length > 0 ? reasonCodes : undefined,
          });
          // Geen router.refresh() — warning blijft zichtbaar tot user "Toon definitief weekmenu" klikt
        } else {
          router.refresh();
        }
      } else {
        setError({
          message: result.error.message,
          code: result.error.code,
          details: result.error.details,
        });
      }
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Fout bij toepassen',
      });
    } finally {
      setApplyLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    setError(null);
    try {
      const result = await cancelMealPlanReviewAction({ planId });
      if (result.ok) {
        router.refresh();
      } else {
        setError({ message: result.error.message });
      }
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Fout bij annuleren',
      });
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Text className="font-medium text-amber-900 dark:text-amber-100">
            Je bewerkt een concept (draft). Pas je wijzigingen toe om dit
            weekmenu definitief te maken.
          </Text>
          {error && (
            <div
              className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
              role="alert"
            >
              <Text>{error.message}</Text>
              {error.code === 'GUARDRAILS_VIOLATION' &&
                error.details?.householdRuleApplied === true && (
                  <div className="mt-2 space-y-1">
                    <Text className="text-red-800 dark:text-red-200">
                      Deze draft schendt huishouden-allergieën/avoid regels.
                    </Text>
                    <Link
                      href="/familie/edit#household-avoid"
                      className="inline-flex items-center text-sm font-medium text-red-700 underline hover:text-red-900 dark:text-red-300 dark:hover:text-red-100"
                    >
                      Gezinsinstellingen (avoid-regels)
                    </Link>
                  </div>
                )}
            </div>
          )}
          {applyWarning && (
            <div
              className="mt-2 rounded-lg border border-amber-300 bg-amber-100 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
              role="status"
            >
              <Text className="font-medium">Waarschuwing</Text>
              <Text className="mt-0.5">{applyWarning.message}</Text>
              {applyWarning.reasonCodes &&
                applyWarning.reasonCodes.length > 0 && (
                  <Text className="mt-1 text-amber-800 dark:text-amber-300">
                    Redenen: {applyWarning.reasonCodes.join(', ')}
                    {applyWarning.reasonCodes.length >= 3 ? ' …' : ''}
                  </Text>
                )}
            </div>
          )}
          {didApplySuccessfully && applyWarning && (
            <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
              <Text>Draft is toegepast. Bekijk het definitieve weekmenu.</Text>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {didApplySuccessfully && applyWarning ? (
            <Button
              outline
              onClick={() => router.refresh()}
              className="inline-flex items-center gap-2"
            >
              Toon definitief weekmenu
            </Button>
          ) : (
            <>
              <Button
                onClick={handleApply}
                disabled={applyLoading || cancelLoading || didApplySuccessfully}
                className="inline-flex items-center gap-2"
              >
                {applyLoading ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Bezig…
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="size-4" />
                    Pas draft toe
                  </>
                )}
              </Button>
              <Button
                outline
                onClick={handleCancel}
                disabled={applyLoading || cancelLoading || didApplySuccessfully}
                className="inline-flex items-center gap-2"
              >
                {cancelLoading ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Bezig…
                  </>
                ) : (
                  <>
                    <XCircleIcon className="size-4" />
                    Annuleer review
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
