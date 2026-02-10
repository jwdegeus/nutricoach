'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/src/components/app/ToastContext';
import { Button } from '@/components/catalyst/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';
import { Badge } from '@/components/catalyst/badge';
import { Switch } from '@/components/catalyst/switch';
import { Text } from '@/components/catalyst/text';
import type { TherapeuticProtocolRow } from '../actions/therapeuticProtocols.actions';
import { toggleTherapeuticProtocolActiveAction } from '../actions/therapeuticProtocols.actions';

type Props = {
  initialData: TherapeuticProtocolRow[] | null;
  loadError: string | null;
};

export function TherapeuticProtocolsAdminClient({
  initialData,
  loadError,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const t = useTranslations('admin.therapeuticProtocols');

  const handleToggle = (id: string, nextActive: boolean) => {
    setTogglingId(id);
    startTransition(async () => {
      const result = await toggleTherapeuticProtocolActiveAction({
        id,
        isActive: nextActive,
      });
      setTogglingId(null);
      if ('error' in result) {
        showToast({
          type: 'error',
          title: t('toastSetActiveError'),
          description: result.error,
        });
        return;
      }
      showToast({
        type: 'success',
        title: nextActive
          ? t('toastProtocolActivated')
          : t('toastProtocolDeactivated'),
      });
      router.refresh();
    });
  };

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-950/20">
        <Text className="text-red-800 dark:text-red-200">{loadError}</Text>
      </div>
    );
  }

  if (initialData === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
            {t('pageTitle')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            {t('pageDescription')}
          </p>
        </div>
        <Button outline href="/admin/therapeutic-when-json-snippets">
          {t('whenJsonSnippetsLink')}
        </Button>
      </div>

      <div className="flow-root">
        <Table
          className="[--gutter:--spacing(6)] sm:[--gutter:--spacing(8)]"
          striped
        >
          <TableHead>
            <TableRow>
              <TableHeader>{t('tableProtocol')}</TableHeader>
              <TableHeader>{t('tableName')}</TableHeader>
              <TableHeader>{t('tableVersion')}</TableHeader>
              <TableHeader>{t('tableStatus')}</TableHeader>
              <TableHeader className="w-12" aria-label={t('active')} />
            </TableRow>
          </TableHead>
          <TableBody>
            {initialData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-zinc-500 dark:text-zinc-400"
                >
                  {t('noProtocolsFound')}
                </TableCell>
              </TableRow>
            ) : (
              initialData.map((row) => (
                <TableRow
                  key={row.id}
                  href={`/admin/therapeutic-protocols/${row.id}`}
                  title={`${row.name_nl} openen`}
                >
                  <TableCell className="font-mono text-sm font-medium text-zinc-900 dark:text-white max-w-[140px] truncate">
                    {row.protocol_key}
                  </TableCell>
                  <TableCell className="font-medium text-zinc-900 dark:text-white max-w-[200px] truncate">
                    {row.name_nl}
                  </TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-400 text-sm tabular-nums">
                    {row.version ?? '—'}
                  </TableCell>
                  <TableCell>
                    {row.is_active ? (
                      <Badge color="green">{t('active')}</Badge>
                    ) : (
                      <Badge color="zinc">{t('inactive')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="relative">
                    <span
                      className="relative z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Switch
                        checked={row.is_active}
                        disabled={togglingId === row.id || isPending}
                        onChange={(checked) => handleToggle(row.id, checked)}
                        color="dark/zinc"
                      />
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
