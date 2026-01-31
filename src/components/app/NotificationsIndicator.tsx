'use client';

import { useEffect, useState } from 'react';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownHeader,
  DropdownDivider,
  DropdownItem,
} from '@/components/catalyst/dropdown';
import { NavbarItem } from '@/components/catalyst/navbar';
import {
  BellIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/20/solid';
import { getNotificationsAction } from '@/src/app/(app)/meal-plans/actions/notifications.actions';

export type Notification = {
  id: string;
  planId: string;
  runType: string;
  status: 'running' | 'success' | 'error';
  createdAt: string;
  errorMessage?: string;
  summary?: string;
};

export function NotificationsIndicator() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const loadNotifications = async () => {
      setIsLoading(true);
      const result = await getNotificationsAction();
      if (result.ok) {
        setNotifications(result.data);
        // Count unread (running + error from last 24h)
        const now = Date.now();
        const unread = result.data.filter((n) => {
          const created = new Date(n.createdAt).getTime();
          const hoursAgo = (now - created) / (1000 * 60 * 60);
          return (
            (n.status === 'running' || n.status === 'error') && hoursAgo < 24
          );
        }).length;
        setUnreadCount(unread);
      }
      setIsLoading(false);
    };

    loadNotifications();

    // Poll every 5 seconds for updates
    const intervalId = setInterval(loadNotifications, 5000);

    return () => clearInterval(intervalId);
  }, []);

  const getStatusIcon = (status: Notification['status']) => {
    switch (status) {
      case 'running':
        return (
          <ArrowPathIcon className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
        );
      case 'success':
        return (
          <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
        );
      case 'error':
        return (
          <XCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
        );
    }
  };

  const _getStatusLabel = (status: Notification['status']) => {
    switch (status) {
      case 'running':
        return 'Bezig';
      case 'success':
        return 'Voltooid';
      case 'error':
        return 'Fout';
    }
  };

  const getRunTypeLabel = (runType: string) => {
    const labels: Record<string, string> = {
      generate: 'Genereren',
      regenerate: 'Regenereren',
      enrich: 'Verrijken',
    };
    return labels[runType] || runType;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Zojuist';
    if (diffMins < 60) return `${diffMins} min geleden`;
    if (diffHours < 24) return `${diffHours} uur geleden`;
    if (diffDays < 7) return `${diffDays} dagen geleden`;
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  };

  // Group notifications by status
  const running = notifications.filter((n) => n.status === 'running');
  const errors = notifications.filter((n) => n.status === 'error').slice(0, 5);
  const recent = notifications
    .filter((n) => n.status === 'success')
    .slice(0, 5);

  return (
    <Dropdown>
      <DropdownButton as={NavbarItem} className="relative">
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </DropdownButton>
      <DropdownMenu anchor="bottom end" className="w-80 max-h-[32rem]">
        <DropdownHeader>
          <div className="flex items-center justify-between w-full">
            <span className="font-semibold text-zinc-950 dark:text-white">
              Notificaties
            </span>
            {unreadCount > 0 && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {unreadCount} nieuw
              </span>
            )}
          </div>
        </DropdownHeader>
        <DropdownDivider />

        {isLoading ? (
          <div className="px-3.5 py-4 text-sm text-zinc-500 dark:text-zinc-400 text-center">
            Laden...
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-3.5 py-4 text-sm text-zinc-500 dark:text-zinc-400 text-center">
            Geen notificaties
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[24rem]">
            {/* Running notifications */}
            {running.length > 0 && (
              <>
                <div className="px-3.5 pt-2 pb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Bezig
                </div>
                {running.map((notification) =>
                  notification.planId ? (
                    <DropdownItem
                      key={notification.id}
                      href={`/meal-plans/${notification.planId}`}
                    >
                      <div className="flex items-start gap-2 w-full">
                        {getStatusIcon(notification.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm/6 font-medium text-zinc-950 dark:text-white sm:text-base/6">
                            {getRunTypeLabel(notification.runType)}
                          </div>
                          <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400 sm:text-sm/5">
                            {formatTime(notification.createdAt)}
                          </div>
                        </div>
                      </div>
                    </DropdownItem>
                  ) : (
                    <div
                      key={notification.id}
                      className="px-3.5 py-2.5 sm:px-3 sm:py-1.5"
                    >
                      <div className="flex items-start gap-2 w-full">
                        {getStatusIcon(notification.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm/6 font-medium text-zinc-950 dark:text-white sm:text-base/6">
                            {getRunTypeLabel(notification.runType)}
                          </div>
                          <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400 sm:text-sm/5">
                            {formatTime(notification.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
                {(errors.length > 0 || recent.length > 0) && (
                  <DropdownDivider />
                )}
              </>
            )}

            {/* Error notifications */}
            {errors.length > 0 && (
              <>
                <div className="px-3.5 pt-2 pb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Fouten
                </div>
                {errors.map((notification) =>
                  notification.planId ? (
                    <DropdownItem
                      key={notification.id}
                      href={`/meal-plans/${notification.planId}`}
                    >
                      <div className="flex items-start gap-2 w-full">
                        {getStatusIcon(notification.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm/6 font-medium text-zinc-950 dark:text-white sm:text-base/6">
                            {getRunTypeLabel(notification.runType)} - Fout
                          </div>
                          <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400 sm:text-sm/5">
                            {notification.errorMessage || 'Onbekende fout'}
                          </div>
                          <div className="mt-0.5 text-xs/4 text-zinc-400 dark:text-zinc-500">
                            {formatTime(notification.createdAt)}
                          </div>
                        </div>
                      </div>
                    </DropdownItem>
                  ) : (
                    <div
                      key={notification.id}
                      className="px-3.5 py-2.5 sm:px-3 sm:py-1.5"
                    >
                      <div className="flex items-start gap-2 w-full">
                        {getStatusIcon(notification.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm/6 font-medium text-zinc-950 dark:text-white sm:text-base/6">
                            {getRunTypeLabel(notification.runType)} - Fout
                          </div>
                          <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400 sm:text-sm/5">
                            {notification.errorMessage || 'Onbekende fout'}
                          </div>
                          <div className="mt-0.5 text-xs/4 text-zinc-400 dark:text-zinc-500">
                            {formatTime(notification.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
                {recent.length > 0 && <DropdownDivider />}
              </>
            )}

            {/* Recent completed notifications */}
            {recent.length > 0 && (
              <>
                <div className="px-3.5 pt-2 pb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Recent Voltooid
                </div>
                {recent.map((notification) =>
                  notification.planId ? (
                    <DropdownItem
                      key={notification.id}
                      href={`/meal-plans/${notification.planId}`}
                    >
                      <div className="flex items-start gap-2 w-full">
                        {getStatusIcon(notification.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm/6 font-medium text-zinc-950 dark:text-white sm:text-base/6">
                            {getRunTypeLabel(notification.runType)} - Voltooid
                          </div>
                          <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400 sm:text-sm/5">
                            {formatTime(notification.createdAt)}
                          </div>
                        </div>
                      </div>
                    </DropdownItem>
                  ) : (
                    <div
                      key={notification.id}
                      className="px-3.5 py-2.5 sm:px-3 sm:py-1.5"
                    >
                      <div className="flex items-start gap-2 w-full">
                        {getStatusIcon(notification.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm/6 font-medium text-zinc-950 dark:text-white sm:text-base/6">
                            {getRunTypeLabel(notification.runType)} - Voltooid
                          </div>
                          <div className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400 sm:text-sm/5">
                            {formatTime(notification.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </>
            )}
          </div>
        )}
      </DropdownMenu>
    </Dropdown>
  );
}
