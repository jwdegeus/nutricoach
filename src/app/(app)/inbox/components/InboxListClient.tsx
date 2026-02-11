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
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import {
  markInboxNotificationReadAction,
  deleteInboxNotificationAction,
} from '../actions/inboxNotifications.actions';
import type { InboxNotificationRecord } from '../actions/inboxNotifications.actions';
import { Loader2, Inbox } from 'lucide-react';
import { TrashIcon } from '@heroicons/react/16/solid';

type InboxListClientProps = {
  initialNotifications: InboxNotificationRecord[];
};

function formatDate(createdAt: string): string {
  const date = new Date(createdAt);
  return date.toLocaleString('nl-NL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DetailsMeta({
  details,
}: {
  details: InboxNotificationRecord['details'];
}) {
  if (!details) return null;
  const parts: string[] = [];
  if (details.planId) parts.push(`Plan: ${details.planId.slice(0, 8)}…`);
  if (details.runId) parts.push(`Run: ${details.runId.slice(0, 8)}…`);
  if (details.errorCode) parts.push(`Code: ${details.errorCode}`);
  if (parts.length === 0) return null;
  return (
    <Text className="mt-1 text-xs text-muted-foreground">
      {parts.join(' · ')}
    </Text>
  );
}

export function InboxListClient({
  initialNotifications,
}: InboxListClientProps) {
  const router = useRouter();
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const result = await deleteInboxNotificationAction({ id });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij verwijderen');
    } finally {
      setDeletingId(null);
    }
  };

  const handleMarkRead = async (id: string) => {
    setMarkingId(id);
    setError(null);

    try {
      const result = await markInboxNotificationReadAction({ id });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Fout bij markeren als gelezen',
      );
    } finally {
      setMarkingId(null);
    }
  };

  if (initialNotifications.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Heading>Notificaties</Heading>
        <div className="mt-4 flex flex-col items-center justify-center gap-4 py-8">
          <Inbox className="h-12 w-12 text-zinc-400 dark:text-zinc-500" />
          <Text className="text-sm text-muted-foreground">
            Geen notificaties
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="p-6">
        <Heading>Notificaties ({initialNotifications.length})</Heading>

        {error && (
          <div
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
            role="alert"
          >
            <Text className="font-medium">Fout</Text>
            <Text className="mt-1 text-sm">{error}</Text>
          </div>
        )}

        <div className="mt-4">
          <Table className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]">
            <TableHead>
              <TableRow>
                <TableHeader className="w-16">Status</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Titel</TableHeader>
                <TableHeader>Bericht</TableHeader>
                <TableHeader className="text-muted-foreground">
                  Datum
                </TableHeader>
                <TableHeader className="text-right">Actie</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {initialNotifications.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>
                    {!n.isRead && (
                      <Badge color="yellow" className="text-xs">
                        Nieuw
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">
                      {n.type}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{n.title}</TableCell>
                  <TableCell>
                    <Text className="text-sm">{n.message}</Text>
                    <DetailsMeta details={n.details} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(n.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {n.type === 'meal_plan_ready_for_review' &&
                        (() => {
                          const details = n.details;
                          const planId =
                            typeof details === 'object' &&
                            details !== null &&
                            'planId' in details &&
                            typeof (details as { planId?: unknown }).planId ===
                              'string'
                              ? (details as { planId: string }).planId
                              : undefined;
                          if (!planId || planId.length === 0) return null;
                          return (
                            <Button
                              outline
                              onClick={() =>
                                router.push(`/meal-plans/${planId}`)
                              }
                            >
                              Open weekmenu
                            </Button>
                          );
                        })()}
                      {n.type === 'meal_plan_generation_failed' && (
                        <Button
                          outline
                          onClick={() => {
                            const details = n.details;
                            const planId =
                              typeof details === 'object' &&
                              details !== null &&
                              'planId' in details &&
                              typeof (details as { planId?: unknown })
                                .planId === 'string'
                                ? (details as { planId: string }).planId
                                : undefined;
                            if (planId) {
                              router.push(`/meal-plans/${planId}`);
                            } else {
                              router.push('/meal-plans/new?retry=1');
                            }
                          }}
                        >
                          Probeer opnieuw
                        </Button>
                      )}
                      {!n.isRead && (
                        <Button
                          outline
                          disabled={markingId !== null}
                          onClick={() => handleMarkRead(n.id)}
                        >
                          {markingId === n.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Markeer gelezen'
                          )}
                        </Button>
                      )}
                      <Button
                        plain
                        disabled={deletingId !== null}
                        onClick={() => handleDelete(n.id)}
                        className="hover:text-destructive text-muted-foreground"
                        title="Verwijderen"
                        aria-label="Verwijderen"
                      >
                        {deletingId === n.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TrashIcon className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
