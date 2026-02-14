'use client';

import type { ReactNode } from 'react';
import { useState, useEffect, useRef } from 'react';
import type { MealPlanResponse } from '@/src/lib/diets';
import type { MealPlanEnrichmentResponse } from '@/src/lib/meal-plans/enrichment.types';
import type { MealPlanStatus } from '@/src/lib/meal-plans/mealPlans.types';
import { GuardrailsViolationEmptyState } from './GuardrailsViolationEmptyState';
import { getCurrentDietIdAction } from '@/src/app/(app)/recipes/[recipeId]/actions/recipe-ai.persist.actions';
import { regenerateMealPlanAction } from '../../actions/mealPlans.actions';
import { useRouter } from 'next/navigation';
import { useToast } from '@/src/components/app/ToastContext';

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

type MealPlanPageWrapperProps = {
  planId: string;
  plan: MealPlanResponse;
  enrichment?: MealPlanEnrichmentResponse | null;
  nevoFoodNamesByCode: Record<string, string>;
  planStatus?: MealPlanStatus;
  children: ReactNode;
};

export function MealPlanPageWrapper({
  planId,
  plan: _plan,
  enrichment: _enrichment,
  nevoFoodNamesByCode: _nevoFoodNamesByCode,
  planStatus: _planStatus,
  children,
}: MealPlanPageWrapperProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [guardrailsViolation, setGuardrailsViolation] =
    useState<GuardrailsViolationState | null>(null);
  const violationRef = useRef<GuardrailsViolationState | null>(null);
  const [dietTypeId, setDietTypeId] = useState<string | undefined>(undefined);
  const [isRetrying, setIsRetrying] = useState(false);

  // Listen for guardrails violation events from MealPlanActions
  useEffect(() => {
    const handleViolation = (event: CustomEvent<GuardrailsViolationState>) => {
      setGuardrailsViolation(event.detail);
    };

    const handleViolationCleared = () => {
      setGuardrailsViolation(null);
    };

    window.addEventListener(
      'guardrails-violation',
      handleViolation as EventListener,
    );
    window.addEventListener(
      'guardrails-violation-cleared',
      handleViolationCleared,
    );

    return () => {
      window.removeEventListener(
        'guardrails-violation',
        handleViolation as EventListener,
      );
      window.removeEventListener(
        'guardrails-violation-cleared',
        handleViolationCleared,
      );
    };
  }, []);

  // Fetch dietTypeId when violation occurs
  useEffect(() => {
    if (guardrailsViolation && !dietTypeId) {
      getCurrentDietIdAction().then((result) => {
        if (result.ok && result.data) {
          setDietTypeId(result.data.dietId);
        }
      });
    }
  }, [guardrailsViolation, dietTypeId]);

  const handleRetry = async () => {
    violationRef.current = guardrailsViolation;
    setIsRetrying(true);
    setGuardrailsViolation(null);

    try {
      const result = await regenerateMealPlanAction({ planId });

      if (result.ok) {
        router.refresh();
        router.push(`/meal-plans/${planId}/shopping`);
      } else if (result.error.code === 'FEATURE_DISABLED') {
        showToast({
          type: 'error',
          title: 'Regeneratie uitgeschakeld',
          description: result.error.message,
        });
        setGuardrailsViolation(violationRef.current);
      } else {
        // Check for guardrails violation again
        if (
          result.error.code === 'GUARDRAILS_VIOLATION' &&
          result.error.details &&
          'reasonCodes' in result.error.details
        ) {
          const d = result.error.details;
          setGuardrailsViolation({
            reasonCodes: d.reasonCodes,
            contentHash: d.contentHash,
            rulesetVersion: d.rulesetVersion,
            ...('forceDeficits' in d &&
              Array.isArray(d.forceDeficits) && {
                forceDeficits: d.forceDeficits,
              }),
          });
        }
      }
    } catch (err) {
      console.error('Error retrying meal plan generation:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <>
      {/* Show guardrails violation empty state instead of meal plan cards */}
      {guardrailsViolation ? (
        <GuardrailsViolationEmptyState
          reasonCodes={guardrailsViolation.reasonCodes}
          contentHash={guardrailsViolation.contentHash}
          rulesetVersion={guardrailsViolation.rulesetVersion}
          forceDeficits={guardrailsViolation.forceDeficits}
          dietTypeId={dietTypeId}
          onRetry={handleRetry}
          isRetrying={isRetrying}
        />
      ) : (
        children
      )}
    </>
  );
}
