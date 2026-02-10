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
        round="max-sm:rounded-t-4xl rounded-bl-lg sm:rounded-tl-4xl lg:rounded-tl-4xl lg:rounded-bl-lg lg:rounded-l-4xl"
        bg="bg-muted"
      >
        <div className={kpiContentClass}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UsersIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {t('kpiMembers')}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              4
            </p>
          </div>
        </div>
      </BentoCell>

      <BentoCell
        round="max-sm:rounded-none rounded-lg sm:rounded-tr-4xl lg:rounded-lg"
        bg="bg-muted"
      >
        <div className={kpiContentClass}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ChartBarIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {t('kpiMacroScore')}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              87%
            </p>
          </div>
        </div>
      </BentoCell>

      <BentoCell round="rounded-lg" bg="bg-muted">
        <div className={kpiContentClass}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <BeakerIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {t('kpiSupplements')}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              3/4
            </p>
          </div>
        </div>
      </BentoCell>

      <BentoCell
        round="max-sm:rounded-b-4xl rounded-br-lg sm:rounded-br-4xl lg:rounded-r-4xl"
        bg="bg-muted"
      >
        <div className={kpiContentClass}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <CalendarDaysIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {t('kpiPeriod')}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              7d
            </p>
          </div>
        </div>
      </BentoCell>
    </>
  );
}
