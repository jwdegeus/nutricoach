'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Text } from '@/components/catalyst/text';
import { Link } from '@/components/catalyst/link';
import { runMealPlanJobNowAction } from '../actions/mealPlanJobs.actions';
import type { JobRow } from '../actions/mealPlanJobs.actions';
import { Loader2 } from 'lucide-react';

type JobsTableClientProps = {
  jobs: JobRow[];
  formatScheduledFor: (iso: string) => string;
  statusBadgeColor: (
    status: string,
  ) => 'yellow' | 'blue' | 'green' | 'red' | 'zinc';
  statusLabels: Record<string, string>;
  weekFromSnapshot: (snapshot: JobRow['requestSnapshot']) => string;
};

export function JobsTableClient({
  jobs,
  formatScheduledFor,
  statusBadgeColor,
  statusLabels,
  weekFromSnapshot,
}: JobsTableClientProps) {
  const router = useRouter();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successPlanId, setSuccessPlanId] = useState<string | null>(null);

  const canRun = (j: JobRow) =>
    (j.status === 'scheduled' || j.status === 'failed') &&
    j.attempt < j.maxAttempts;

  const handleRunNow = async (jobId: string) => {
    setRunningId(jobId);
    setError(null);
    setSuccessPlanId(null);
    try {
      const result = await runMealPlanJobNowAction({ jobId });
      if (result.ok && result.data) {
        setSuccessPlanId(result.data.mealPlanId);
        router.refresh();
      } else if (!result.ok) {
        setError(result.error.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Fout bij uitvoeren van job',
      );
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
          role="alert"
        >
          <Text className="font-medium">Fout</Text>
          <Text className="mt-1 text-sm">{error}</Text>
        </div>
      )}

      {successPlanId && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
          <Text className="font-medium">Weekmenu aangemaakt</Text>
          <Text className="mt-1 text-sm">
            <Link href={`/meal-plans/${successPlanId}`}>Open weekmenu</Link>
          </Text>
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-700 dark:bg-zinc-900">
        <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
          <TableHead>
            <TableRow>
              <TableHeader>Status</TableHeader>
              <TableHeader>Week</TableHeader>
              <TableHeader>Scheduled for</TableHeader>
              <TableHeader>Pogingen</TableHeader>
              <TableHeader className="text-muted-foreground">
                Laatste fout
              </TableHeader>
              <TableHeader>Resultaat</TableHeader>
              <TableHeader className="text-right">Actie</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((j) => (
              <TableRow key={j.id}>
                <TableCell>
                  <Badge color={statusBadgeColor(j.status)}>
                    {statusLabels[j.status] ?? j.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm">
                    {weekFromSnapshot(j.requestSnapshot)}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {formatScheduledFor(j.scheduledFor)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {j.attempt} / {j.maxAttempts}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {j.lastErrorCode ?? '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {j.mealPlanId ? (
                    <Link href={`/meal-plans/${j.mealPlanId}`}>
                      Open weekmenu
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canRun(j) && (
                    <Button
                      outline
                      disabled={runningId !== null}
                      onClick={() => handleRunNow(j.id)}
                    >
                      {runningId === j.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Nu uitvoeren'
                      )}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
