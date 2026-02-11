'use client';

import { useCallback, useEffect, useState } from 'react';
import { MealPlanActions } from './MealPlanActions';
import type { MealPlanResponse } from '@/src/lib/diets';
import type { MealPlanStatus } from '@/src/lib/meal-plans/mealPlans.types';

type GuardrailsViolationState = {
  reasonCodes: string[];
  contentHash: string;
  rulesetVersion?: number;
};

/**
 * Client-only wrapper for MealPlanActions to prevent hydration mismatches
 * Headless UI generates random IDs that differ between server and client.
 * This component ensures the actions only render on the client side after hydration.
 * Guardrails violation state is communicated to MealPlanPageWrapper via custom events (no callback from Server Component).
 */
export function MealPlanActionsClient({
  planId,
  plan,
  planStatus,
}: {
  planId: string;
  plan: MealPlanResponse;
  planStatus?: MealPlanStatus;
}) {
  const [mounted, setMounted] = useState(false);

  const onGuardrailsViolation = useCallback(
    (violation: GuardrailsViolationState | null) => {
      if (typeof window === 'undefined') return;
      if (violation) {
        window.dispatchEvent(
          new CustomEvent('guardrails-violation', { detail: violation }),
        );
      } else {
        window.dispatchEvent(new CustomEvent('guardrails-violation-cleared'));
      }
    },
    [],
  );

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  // During SSR and initial render, return a simple loading state
  // This prevents hydration mismatches
  if (!mounted) {
    return (
      <div className="rounded-2xl bg-muted/20 p-6 shadow-sm">
        <div className="mb-4 h-6 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="space-y-4">
          <div className="h-10 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="flex gap-2">
            <div className="h-10 flex-1 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-10 w-10 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="h-4 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  return (
    <MealPlanActions
      planId={planId}
      plan={plan}
      planStatus={planStatus}
      onGuardrailsViolation={onGuardrailsViolation}
    />
  );
}
