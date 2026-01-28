import type { Metadata } from 'next';
import { TopMealsWidget } from '@/src/components/app/dashboard/top-meals-widget';
import { getTopConsumedMealsAction } from '@/src/app/(app)/recipes/actions/meals.actions';

export const metadata: Metadata = {
  title: 'Dashboard | NutriCoach',
  description: 'NutriCoach Dashboard Overview',
};

export default async function DashboardPage() {
  // Fetch top meals on the server
  const topMealsResult = await getTopConsumedMealsAction();
  const topMeals = topMealsResult.ok ? topMealsResult.data : [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopMealsWidget initialMeals={topMeals} />
      </div>
    </div>
  );
}
