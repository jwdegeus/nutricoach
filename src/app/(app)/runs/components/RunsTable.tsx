'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import { Button } from '@/components/catalyst/button';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import { cancelRunAction, deleteRunAction } from '../actions/runs.actions';
import type { MealPlanRunRecord } from '../actions/runs.actions';
import { X, Trash2 } from 'lucide-react';

type RunsTableProps = {
  runs: MealPlanRunRecord[];
};

type RunRowProps = {
  run: MealPlanRunRecord;
  formatDate: (dateStr: string) => string;
  formatDuration: (ms: number) => string;
  formatRunningDuration: (ms: number) => string;
  calculateRunningDuration: (createdAt: string) => number;
  getStatusBadgeColor: (status: string) => 'green' | 'yellow' | 'red' | 'zinc';
  getRunTypeLabel: (runType: string) => string;
  isStuck: (run: MealPlanRunRecord) => boolean;
  onAction: () => void;
  onCancel: (runId: string) => void;
  onDelete: (runId: string) => void;
};

function RunRow({
  run,
  formatDate,
  formatDuration,
  formatRunningDuration,
  calculateRunningDuration,
  getStatusBadgeColor,
  getRunTypeLabel,
  isStuck,
  onAction: _onAction,
  onCancel,
  onDelete,
}: RunRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [error, _setError] = useState<string | null>(null);
  const runningDuration =
    run.status === 'running' ? calculateRunningDuration(run.createdAt) : null;
  const stuck = isStuck(run);

  const handleCancel = () => {
    onCancel(run.id);
  };

  const handleDelete = () => {
    onDelete(run.id);
  };

  return (
    <>
      <TableRow>
        <TableCell className="text-zinc-500 dark:text-zinc-400">
          {formatDate(run.createdAt)}
        </TableCell>
        <TableCell>
          <span className="capitalize">{getRunTypeLabel(run.runType)}</span>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Badge color={getStatusBadgeColor(run.status)}>{run.status}</Badge>
            {stuck && (
              <Badge color="red" className="text-xs">
                Mogelijk vastgelopen
              </Badge>
            )}
            {runningDuration !== null && (
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                ({formatRunningDuration(runningDuration)})
              </Text>
            )}
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs">{run.model}</TableCell>
        <TableCell>
          {run.status === 'running' && runningDuration !== null
            ? formatRunningDuration(runningDuration)
            : formatDuration(run.durationMs)}
        </TableCell>
        <TableCell>
          {run.errorCode ? (
            <Badge color="red" className="font-mono text-xs">
              {run.errorCode}
            </Badge>
          ) : (
            <span className="text-zinc-500 dark:text-zinc-400">—</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={run.constraintsInPrompt ? 'green' : 'zinc'}>
              Constraints: {run.constraintsInPrompt ? 'ja' : 'nee'}
            </Badge>
            {run.guardrailsContentHash && (
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                hash:{' '}
                {run.guardrailsContentHash.length > 8
                  ? `${run.guardrailsContentHash.slice(0, 8)}…`
                  : run.guardrailsContentHash}
              </Text>
            )}
            {run.guardrailsVersion != null && run.guardrailsVersion !== '' && (
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                v:{' '}
                {run.guardrailsVersion.length > 12
                  ? `${run.guardrailsVersion.slice(0, 12)}…`
                  : run.guardrailsVersion}
              </Text>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {(run.errorMessage || run.status === 'running' || stuck) && (
              <Button
                plain
                onClick={() => setExpanded(!expanded)}
                className="text-xs"
              >
                {expanded ? 'Verberg' : 'Details'}
              </Button>
            )}
            {run.status === 'running' && (
              <Button
                plain
                onClick={handleCancel}
                className="text-xs text-red-600 dark:text-red-400"
                title="Annuleer run"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <Button
              plain
              onClick={handleDelete}
              className="text-xs text-red-600 dark:text-red-400"
              title="Verwijder run"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-zinc-50 dark:bg-zinc-900/50">
            <div className="space-y-2 py-2">
              {run.status === 'running' && runningDuration !== null && (
                <div>
                  <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Looptijd:
                  </Text>
                  <Text className="text-xs text-zinc-600 dark:text-zinc-400 ml-2">
                    {formatRunningDuration(runningDuration)} (sinds{' '}
                    {formatDate(run.createdAt)})
                  </Text>
                  {stuck && (
                    <Text className="text-xs text-red-600 dark:text-red-400 ml-2">
                      ⚠️ Deze run loopt al langer dan 5 minuten en kan
                      vastgelopen zijn.
                    </Text>
                  )}
                </div>
              )}
              {run.errorCode && (
                <div>
                  <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Error Code:
                  </Text>
                  <Text className="text-xs text-zinc-600 dark:text-zinc-400 ml-2 font-mono">
                    {run.errorCode}
                  </Text>
                </div>
              )}
              {run.errorMessage && (
                <div>
                  <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Error Message:
                  </Text>
                  <Text className="text-xs text-zinc-600 dark:text-zinc-400 ml-2 whitespace-pre-wrap">
                    {run.errorMessage}
                  </Text>
                </div>
              )}
              {run.mealPlanId && (
                <div>
                  <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Weekmenu ID:
                  </Text>
                  <Text className="text-xs text-zinc-600 dark:text-zinc-400 ml-2 font-mono">
                    {run.mealPlanId}
                  </Text>
                </div>
              )}
              <div>
                <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Run ID:
                </Text>
                <Text className="text-xs text-zinc-600 dark:text-zinc-400 ml-2 font-mono">
                  {run.id}
                </Text>
              </div>
              {error && (
                <div className="mt-2">
                  <Text className="text-xs text-red-600 dark:text-red-400">
                    Fout: {error}
                  </Text>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function RunsTable({ runs }: RunsTableProps) {
  const router = useRouter();
  const [cancelRunId, setCancelRunId] = useState<string | null>(null);
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAction = () => {
    // Refresh the page data
    router.refresh();
  };

  const handleCancel = (runId: string) => {
    setCancelRunId(runId);
  };

  const handleCancelConfirm = () => {
    if (!cancelRunId) return;

    const runId = cancelRunId;
    setCancelRunId(null);
    startTransition(async () => {
      const result = await cancelRunAction(runId);
      if (result.ok) {
        router.refresh();
        handleAction();
      }
    });
  };

  const handleDelete = (runId: string) => {
    setDeleteRunId(runId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteRunId) return;

    const runId = deleteRunId;
    setDeleteRunId(null);
    startTransition(async () => {
      const result = await deleteRunAction(runId);
      if (result.ok) {
        // Small delay to ensure database is updated
        await new Promise((resolve) => setTimeout(resolve, 100));
        router.refresh();
        handleAction();
      } else {
        // Show error to user
        console.error('Delete failed:', result.error);
        alert(`Fout bij verwijderen: ${result.error.message}`);
      }
    });
  };

  if (runs.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs dark:bg-zinc-900">
        <Heading>Weekmenu runs</Heading>
        <div className="mt-4">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            Geen runs gevonden. Genereer een weekmenu om runs te zien.
          </Text>
        </div>
      </div>
    );
  }

  const formatDuration = (ms: number): string => {
    if (ms === 0) return '0ms';
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString('nl-NL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadgeColor = (
    status: string,
  ): 'green' | 'yellow' | 'red' | 'zinc' => {
    switch (status) {
      case 'success':
        return 'green';
      case 'running':
        return 'yellow';
      case 'error':
        return 'red';
      default:
        return 'zinc';
    }
  };

  const getRunTypeLabel = (runType: string): string => {
    switch (runType) {
      case 'generate':
        return 'Generate';
      case 'regenerate':
        return 'Regenerate';
      case 'enrich':
        return 'Enrich';
      default:
        return runType;
    }
  };

  const calculateRunningDuration = (createdAt: string): number => {
    const startTime = new Date(createdAt).getTime();
    const now = Date.now();
    return now - startTime;
  };

  const formatRunningDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}u ${remainingMinutes}m`;
  };

  const isStuck = (run: MealPlanRunRecord): boolean => {
    if (run.status !== 'running') return false;
    const runningDuration = calculateRunningDuration(run.createdAt);
    // Consider stuck if running for more than 5 minutes
    return runningDuration > 5 * 60 * 1000;
  };

  return (
    <>
      <ConfirmDialog
        open={cancelRunId !== null}
        onClose={() => setCancelRunId(null)}
        onConfirm={handleCancelConfirm}
        title="Run annuleren"
        description="Weet je zeker dat je deze run wilt annuleren?"
        confirmLabel="Annuleren"
        cancelLabel="Terug"
        confirmColor="red"
        isLoading={isPending}
      />
      <ConfirmDialog
        open={deleteRunId !== null}
        onClose={() => setDeleteRunId(null)}
        onConfirm={handleDeleteConfirm}
        title="Run verwijderen"
        description="Weet je zeker dat je deze run wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt."
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        confirmColor="red"
        isLoading={isPending}
      />
      <div className="rounded-lg bg-white p-6 shadow-xs dark:bg-zinc-900">
        <Heading>Weekmenu runs ({runs.length})</Heading>
        <div className="mt-4">
          <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
            <TableHead>
              <TableRow>
                <TableHeader>Datum</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Model</TableHeader>
                <TableHeader>Duur</TableHeader>
                <TableHeader>Error Code</TableHeader>
                <TableHeader>Guardrails</TableHeader>
                <TableHeader>Acties</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  formatDate={formatDate}
                  formatDuration={formatDuration}
                  formatRunningDuration={formatRunningDuration}
                  calculateRunningDuration={calculateRunningDuration}
                  getStatusBadgeColor={getStatusBadgeColor}
                  getRunTypeLabel={getRunTypeLabel}
                  isStuck={isStuck}
                  onAction={handleAction}
                  onCancel={handleCancel}
                  onDelete={handleDelete}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
