'use client';

import dynamic from 'next/dynamic';
import type { MealPlanRecord } from '@/src/lib/meal-plans/mealPlans.types';

const CalendarView = dynamic(
  () => import('./CalendarView').then((mod) => ({ default: mod.CalendarView })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground">Kalender laden...</p>
      </div>
    ),
  },
);

export function CalendarViewDynamic({ plans }: { plans: MealPlanRecord[] }) {
  return <CalendarView plans={plans} />;
}
