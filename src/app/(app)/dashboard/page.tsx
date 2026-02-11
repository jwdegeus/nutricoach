import type { Metadata } from 'next';
import { DashboardKpiCards } from '@/src/components/app/dashboard/DashboardKpiCards';
import { DashboardBentoContent } from '@/src/components/app/dashboard/DashboardBentoContent';
import { getTopConsumedMealsAction } from '@/src/app/(app)/recipes/actions/meals.actions';

export const metadata: Metadata = {
  title: 'Dashboard | NutriCoach',
  description: 'NutriCoach Dashboard Overview',
};

export default async function DashboardPage() {
  const topMealsResult = await getTopConsumedMealsAction();
  const topMeals = topMealsResult.ok ? topMealsResult.data : [];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col py-4 sm:py-6">
      <header className="shrink-0">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Dashboard
        </h1>
        <p className="mt-2 text-muted-foreground">
          Overzicht van je gezin en inname afgelopen week
        </p>
      </header>

      {/* Bento row 1: 4 KPI cards — full width */}
      <div className="mt-6 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCards />
      </div>

      {/* Bento grid: 3 cols × 2 rows, fills available width */}
      <DashboardBentoContent topMeals={topMeals} />
    </div>
  );
}
