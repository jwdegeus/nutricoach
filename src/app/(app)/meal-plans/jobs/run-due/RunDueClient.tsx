'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/catalyst/button';
import { Text } from '@/components/catalyst/text';
import { Link } from '@/components/catalyst/link';
import { runOneDueMealPlanJobAction } from '../actions/mealPlanJobs.actions';
import type { RunOneDueResult } from '../actions/mealPlanJobs.actions';
import { PlayIcon } from '@heroicons/react/16/solid';

type ResultState = RunOneDueResult | null;

export function RunDueClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultState>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await runOneDueMealPlanJobAction();
      if (res.ok) {
        setResult(res.data);
        router.refresh();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er is iets misgegaan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        type="button"
        onClick={handleRun}
        disabled={loading}
        className="inline-flex items-center gap-2"
      >
        {loading ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Bezig…
          </>
        ) : (
          <>
            <PlayIcon className="size-4" />
            Run 1 due job
          </>
        )}
      </Button>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
          role="alert"
        >
          <Text className="font-medium">Fout</Text>
          <Text className="mt-1 text-sm">{error}</Text>
        </div>
      )}

      {result && result.outcome === 'no_due_job' && (
        <div
          className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
          role="status"
        >
          <Text className="font-medium">Geen due jobs</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Er stond geen job klaar om uit te voeren.
          </Text>
        </div>
      )}

      {result && result.outcome === 'succeeded' && (
        <div
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200"
          role="status"
        >
          <Text className="font-medium">Job uitgevoerd: succeeded</Text>
          <Text className="mt-1 text-sm">
            <Link href={`/meal-plans/${result.mealPlanId}`}>
              Bekijk weekmenu
            </Link>
          </Text>
        </div>
      )}

      {result && result.outcome === 'failed' && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
          role="status"
        >
          <Text className="font-medium">Job uitgevoerd: failed</Text>
          <Text className="mt-1 text-sm">
            Foutcode: {result.errorCode}. Bekijk het jobs-overzicht of Inbox
            voor details.
          </Text>
        </div>
      )}
    </div>
  );
}
