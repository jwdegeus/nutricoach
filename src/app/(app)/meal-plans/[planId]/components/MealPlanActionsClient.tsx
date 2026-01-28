"use client";

import { useEffect, useState } from "react";
import { MealPlanActions } from "./MealPlanActions";
import type { MealPlanResponse } from "@/src/lib/diets";

type GuardrailsViolationState = {
  reasonCodes: string[];
  contentHash: string;
  rulesetVersion?: number;
};

/**
 * Client-only wrapper for MealPlanActions to prevent hydration mismatches
 * Headless UI generates random IDs that differ between server and client.
 * This component ensures the actions only render on the client side after hydration.
 */
export function MealPlanActionsClient({
  planId,
  plan,
  onGuardrailsViolation,
}: {
  planId: string;
  plan: MealPlanResponse;
  onGuardrailsViolation?: (violation: GuardrailsViolationState | null) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR and initial render, return a simple loading state
  // This prevents hydration mismatches
  if (!mounted) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="h-6 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-4" />
        <div className="space-y-4">
          <div className="h-10 w-full bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-64 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-10 flex-1 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="h-10 w-10 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          </div>
          <div className="h-4 w-64 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return <MealPlanActions planId={planId} plan={plan} onGuardrailsViolation={onGuardrailsViolation} />;
}
