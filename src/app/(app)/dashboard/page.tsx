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
    <div className="py-16 sm:py-24">
      <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
        <header className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Overzicht van je gezin en inname afgelopen week
          </p>
        </header>

        {/* Bento row 1: 4 KPI cards */}
        <div className="mt-10 grid gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardKpiCards />
        </div>

        {/* Bento grid: 3 cols × 2 rows, edge rounding */}
        <DashboardBentoContent topMeals={topMeals} />
      </div>
    </div>
  );
}
