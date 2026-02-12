'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Button } from '@/components/catalyst/button';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
} from '@/components/catalyst/dropdown';
import {
  markInboxNotificationReadAction,
  markInboxNotificationUnreadAction,
  deleteInboxNotificationAction,
} from '../actions/inboxNotifications.actions';
import type { InboxNotificationRecord } from '../actions/inboxNotifications.actions';
import { useToast } from '@/src/components/app/ToastContext';
import { Inbox } from 'lucide-react';
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid';

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

/** Unread: prominent blue dot + badge. Read: muted gray badge. */
function getStatusBadgeClass(isRead: boolean): string {
  if (isRead) {
    return 'rounded-md bg-muted/50 px-1.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border';
  }
  return 'rounded-md bg-primary-500/15 px-1.5 py-0.5 text-xs font-medium text-primary-600 dark:text-primary-400 ring-1 ring-inset ring-primary-500/25 dark:ring-primary-400/20';
}

export function InboxListClient({
  initialNotifications,
}: InboxListClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openedNotification = openedId
    ? notifications.find((n) => n.id === openedId)
    : null;

  // Sync badge when inbox is (or becomes) empty
  useEffect(() => {
    if (notifications.length === 0) {
      window.dispatchEvent(new CustomEvent('inbox-updated'));
    }
  }, [notifications.length]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    const prev = notifications;
    setNotifications((n) => n.filter((x) => x.id !== id));
    try {
      const result = await deleteInboxNotificationAction({ id });
      if (result.ok) {
        showToast({ type: 'success', title: 'Notificatie verwijderd' });
        window.dispatchEvent(new CustomEvent('inbox-updated'));
        router.refresh();
      } else {
        setNotifications(prev);
        setError(result.error.message);
        showToast({
          type: 'error',
          title: 'Verwijderen mislukt',
          description: result.error.message,
        });
      }
    } catch (err) {
      setNotifications(prev);
      setError(err instanceof Error ? err.message : 'Fout bij verwijderen');
      showToast({
        type: 'error',
        title: 'Verwijderen mislukt',
        description: err instanceof Error ? err.message : 'Onbekende fout',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleMarkRead = async (id: string, opts?: { silent?: boolean }) => {
    setMarkingId(id);
    setError(null);
    setNotifications((n) =>
      n.map((x) => (x.id === id ? { ...x, isRead: true } : x)),
    );
    try {
      const result = await markInboxNotificationReadAction({ id });
      if (result.ok) {
        if (!opts?.silent) {
          showToast({ type: 'success', title: 'Gemarkeerd als gelezen' });
        }
        window.dispatchEvent(new CustomEvent('inbox-updated'));
        router.refresh();
      } else {
        setNotifications((n) =>
          n.map((x) => (x.id === id ? { ...x, isRead: false } : x)),
        );
        setError(result.error.message);
      }
    } catch (err) {
      setNotifications((n) =>
        n.map((x) => (x.id === id ? { ...x, isRead: false } : x)),
      );
      setError(
        err instanceof Error ? err.message : 'Fout bij markeren als gelezen',
      );
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkUnread = async (id: string) => {
    setMarkingId(id);
    setError(null);
    setNotifications((n) =>
      n.map((x) => (x.id === id ? { ...x, isRead: false } : x)),
    );
    try {
      const result = await markInboxNotificationUnreadAction({ id });
      if (result.ok) {
        showToast({ type: 'success', title: 'Gemarkeerd als ongelezen' });
        window.dispatchEvent(new CustomEvent('inbox-updated'));
        router.refresh();
      } else {
        setNotifications((n) =>
          n.map((x) => (x.id === id ? { ...x, isRead: true } : x)),
        );
        setError(result.error.message);
      }
    } catch (err) {
      setNotifications((n) =>
        n.map((x) => (x.id === id ? { ...x, isRead: true } : x)),
      );
      setError(
        err instanceof Error ? err.message : 'Fout bij markeren als ongelezen',
      );
    } finally {
      setMarkingId(null);
    }
  };

  if (notifications.length === 0) {
    return (
      <div className="rounded-xl bg-card p-12 shadow-sm">
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <Inbox className="h-12 w-12 text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">
            Geen notificaties
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card shadow-sm">
      <div className="px-6 py-4">
        <Heading>Notificaties ({notifications.length})</Heading>
      </div>

      {error && (
        <div
          className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
          role="alert"
        >
          <Text className="font-medium">Fout</Text>
          <Text className="mt-1 text-sm">{error}</Text>
        </div>
      )}

      <ul role="list" className="divide-y divide-border">
        {notifications.map((n) => {
          const planId =
            n.details &&
            typeof n.details === 'object' &&
            'planId' in n.details &&
            typeof (n.details as { planId?: unknown }).planId === 'string'
              ? (n.details as { planId: string }).planId
              : undefined;
          const dateTime = new Date(n.createdAt).toISOString();

          return (
            <li
              key={n.id}
              className="flex items-center justify-between gap-x-6 px-6 py-5"
            >
              <button
                type="button"
                onClick={() => {
                  setOpenedId(n.id);
                  if (!n.isRead) {
                    void handleMarkRead(n.id, { silent: true });
                  }
                }}
                className="group min-w-0 flex-1 text-left"
              >
                <div className="flex items-start gap-x-3">
                  {!n.isRead && (
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-500"
                      aria-hidden
                    />
                  )}
                  <p className="text-sm/6 font-semibold text-foreground group-hover:underline">
                    {n.title}
                  </p>
                  <span className={getStatusBadgeClass(n.isRead)}>
                    {n.isRead ? 'Gelezen' : 'Nieuw'}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                  {n.message}
                </p>
                <div className="mt-1 flex items-center gap-x-2 text-xs/5 text-muted-foreground">
                  <time dateTime={dateTime}>{formatDate(n.createdAt)}</time>
                  <svg
                    viewBox="0 0 2 2"
                    className="size-0.5 fill-current"
                    aria-hidden
                  >
                    <circle r={1} cx={1} cy={1} />
                  </svg>
                  <span className="font-mono">{n.type}</span>
                </div>
              </button>
              <div className="flex flex-none items-center gap-x-4">
                {n.type === 'meal_plan_ready_for_review' && planId ? (
                  <Button
                    outline
                    onClick={() => {
                      if (!n.isRead)
                        void handleMarkRead(n.id, { silent: true });
                      router.push(`/meal-plans/${planId}`);
                    }}
                    className="hidden rounded-md bg-muted/50 px-2.5 py-1.5 text-sm font-semibold text-foreground ring-1 ring-border ring-inset hover:bg-muted sm:inline-flex dark:bg-white/5 dark:ring-white/10 dark:hover:bg-white/10"
                  >
                    Open weekmenu
                  </Button>
                ) : null}
                {n.type === 'meal_plan_generation_failed' ? (
                  <Button
                    outline
                    onClick={() => {
                      if (!n.isRead)
                        void handleMarkRead(n.id, { silent: true });
                      if (planId) {
                        void router.push(`/meal-plans/${planId}`);
                      } else {
                        void router.push('/meal-plans/new?retry=1');
                      }
                    }}
                    className="hidden rounded-md bg-muted/50 px-2.5 py-1.5 text-sm font-semibold text-foreground ring-1 ring-border ring-inset hover:bg-muted sm:inline-flex dark:bg-white/5 dark:ring-white/10 dark:hover:bg-white/10"
                  >
                    Probeer opnieuw
                  </Button>
                ) : null}
                <div className="relative flex-none">
                  <Dropdown>
                    <DropdownButton
                      as={Button}
                      plain
                      className="relative -m-2 block p-2 text-muted-foreground hover:text-foreground data-hover:bg-transparent"
                    >
                      <span className="absolute -inset-2.5" aria-hidden />
                      <span className="sr-only">Opties voor {n.title}</span>
                      <EllipsisVerticalIcon className="size-5" aria-hidden />
                    </DropdownButton>
                    <DropdownMenu
                      anchor="bottom end"
                      className="min-w-36 rounded-lg py-1"
                    >
                      {n.isRead ? (
                        <DropdownItem
                          onClick={() => handleMarkUnread(n.id)}
                          disabled={markingId !== null}
                        >
                          Markeer ongelezen
                        </DropdownItem>
                      ) : (
                        <DropdownItem
                          onClick={() => handleMarkRead(n.id)}
                          disabled={markingId !== null}
                        >
                          Markeer gelezen
                        </DropdownItem>
                      )}
                      <DropdownItem
                        onClick={() => handleDelete(n.id)}
                        disabled={deletingId !== null}
                        className="text-destructive data-focus:bg-destructive/10"
                      >
                        Verwijderen
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {openedNotification && (
        <Dialog
          open={!!openedNotification}
          onClose={() => setOpenedId(null)}
          size="xl"
        >
          <DialogTitle>{openedNotification.title}</DialogTitle>
          <DialogDescription>
            {openedNotification.type === 'meal_plan_generation_failed'
              ? 'Wat je moet doen om het de volgende keer wel te laten lukken:'
              : 'Details:'}
          </DialogDescription>
          <DialogBody>
            <div className="mb-2 flex items-center gap-x-2 text-xs text-muted-foreground">
              <time
                dateTime={new Date(openedNotification.createdAt).toISOString()}
              >
                {formatDate(openedNotification.createdAt)}
              </time>
              <span className="font-mono">{openedNotification.type}</span>
            </div>
            <div className="rounded-lg bg-muted/30 p-4 text-sm whitespace-pre-wrap text-foreground">
              {openedNotification.message}
            </div>
          </DialogBody>
          <DialogActions>
            {openedNotification.type === 'meal_plan_ready_for_review' &&
            planIdFromDetails(openedNotification.details) ? (
              <Button
                onClick={() => {
                  router.push(
                    `/meal-plans/${planIdFromDetails(openedNotification.details)!}`,
                  );
                  setOpenedId(null);
                }}
              >
                Open weekmenu
              </Button>
            ) : null}
            {openedNotification.type === 'meal_plan_generation_failed' ? (
              <Button
                onClick={() => {
                  const planId = planIdFromDetails(openedNotification.details);
                  router.push(
                    planId
                      ? `/meal-plans/${planId}`
                      : '/meal-plans/new?retry=1',
                  );
                  setOpenedId(null);
                }}
              >
                Probeer opnieuw
              </Button>
            ) : null}
            <Button plain onClick={() => setOpenedId(null)}>
              Sluiten
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}

function planIdFromDetails(
  details: InboxNotificationRecord['details'],
): string | undefined {
  if (
    !details ||
    typeof details !== 'object' ||
    !('planId' in details) ||
    typeof (details as { planId?: unknown }).planId !== 'string'
  )
    return undefined;
  return (details as { planId: string }).planId;
}
