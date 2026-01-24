"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { NavbarItem } from "@/components/catalyst/navbar";
import { getActivePlanEditsAction, checkPlanEditStatusAction } from "@/src/app/(app)/meal-plans/[planId]/actions/planEdit.actions";

export function PlanEditStatusIndicator() {
  const pathname = usePathname();
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [activeRuns, setActiveRuns] = useState<Array<{ runId: string; runType: string }>>([]);
  const hasRefreshedRef = useRef(false); // Track if we've already refreshed

  // Extract planId from pathname if we're on a meal plan detail page
  const planIdMatch = pathname.match(/\/meal-plans\/([^\/]+)/);
  const planId = planIdMatch ? planIdMatch[1] : null;

  useEffect(() => {
    if (!planId) {
      setIsRunning(false);
      return;
    }

    let intervalId: NodeJS.Timeout;

    const checkStatus = async () => {
      const result = await getActivePlanEditsAction(planId);
      if (result.ok && result.data.length > 0) {
        setActiveRuns(result.data);
        setIsRunning(true);
      } else {
        setActiveRuns([]);
        setIsRunning(false);
      }
    };

    // Check immediately
    checkStatus();

    // Poll every 2 seconds
    intervalId = setInterval(checkStatus, 2000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [planId]);

  // Also check individual run statuses and remove completed ones
  useEffect(() => {
    if (activeRuns.length === 0) {
      hasRefreshedRef.current = false; // Reset when no active runs
      return;
    }

    const checkRuns = async () => {
      const checks = await Promise.all(
        activeRuns.map(async (run) => {
          const result = await checkPlanEditStatusAction(run.runId);
          return { runId: run.runId, status: result.ok ? result.data.status : "running" };
        })
      );

      const stillRunning = checks.filter((c) => c.status === "running");
      if (stillRunning.length !== activeRuns.length) {
        // Some runs completed
        if (stillRunning.length === 0) {
          setIsRunning(false);
          setActiveRuns([]);
          // Only refresh once when all runs complete
          if (!hasRefreshedRef.current) {
            hasRefreshedRef.current = true;
            // Use a longer delay and only refresh if we're still on the same page
            setTimeout(() => {
              // Double-check we're still on a meal plan page before refreshing
              const currentPlanId = pathname.match(/\/meal-plans\/([^\/]+)/)?.[1];
              if (currentPlanId === planId && hasRefreshedRef.current) {
                router.refresh();
              }
            }, 1000);
          }
        } else {
          setActiveRuns(activeRuns.filter((r) => stillRunning.some((sr) => sr.runId === r.runId)));
        }
      }
    };

    const intervalId = setInterval(checkRuns, 2000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRuns.length]); // Only depend on length, not the array itself

  if (!isRunning || !planId) {
    return null;
  }

  return (
    <NavbarItem className="relative" aria-label="Plan wordt bijgewerkt">
      <ArrowPathIcon className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
    </NavbarItem>
  );
}
