'use client';

import { useTranslations } from 'next-intl';
import {
  UsersIcon,
  ChartBarIcon,
  BeakerIcon,
  CalendarDaysIcon,
} from '@heroicons/react/20/solid';
import { BentoCell } from '@/src/components/app/dashboard/BentoCell';

const kpiContentClass = 'flex items-center gap-3 p-5';

export function DashboardKpiCards() {
  const t = useTranslations('family.dashboard');

  return (
    <>
      <BentoCell
        round="max-sm:rounded-t-lg rounded-bl-lg sm:rounded-tl-lg lg:rounded-tl-lg lg:rounded-bl-lg lg:rounded-l-lg"
        bg="bg-muted"
      >
        <div className={kpiContentClass}>
          <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
            <UsersIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {t('kpiMembers')}
            </p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              4
            </p>
          </div>
        </div>
      </BentoCell>

      <BentoCell round="rounded-lg" bg="bg-muted">
        <div className={kpiContentClass}>
          <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
            <ChartBarIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {t('kpiMacroScore')}
            </p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              87%
            </p>
          </div>
        </div>
      </BentoCell>

      <BentoCell round="rounded-lg" bg="bg-muted">
        <div className={kpiContentClass}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-600/20 text-primary-700 dark:text-primary-400">
            <BeakerIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {t('kpiSupplements')}
            </p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              3/4
            </p>
          </div>
        </div>
      </BentoCell>

      <BentoCell
        round="max-sm:rounded-b-lg rounded-br-lg sm:rounded-br-lg lg:rounded-r-lg"
        bg="bg-muted"
      >
        <div className={kpiContentClass}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-400/20 text-primary-600 dark:text-primary-300">
            <CalendarDaysIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {t('kpiPeriod')}
            </p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              7d
            </p>
          </div>
        </div>
      </BentoCell>
    </>
  );
}
