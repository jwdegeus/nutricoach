import type { Metadata } from 'next';
import { DashboardClient } from '@/src/components/app/dashboard/DashboardClient';
import { getTopConsumedMealsAction } from '@/src/app/(app)/recipes/actions/meals.actions';
import { listFamilyMembersAction } from '@/src/app/(app)/familie/actions/family.actions';

export const metadata: Metadata = {
  title: 'Dashboard | NutriCoach',
  description: 'NutriCoach Dashboard Overview',
};

export default async function DashboardPage() {
  const [topMealsResult, membersResult] = await Promise.all([
    getTopConsumedMealsAction(),
    listFamilyMembersAction(),
  ]);

  const topMeals = topMealsResult.ok ? topMealsResult.data : [];
  const members = membersResult.ok
    ? membersResult.members.map((m) => ({
        id: m.id,
        name: m.name,
        is_self: m.is_self,
      }))
    : [];

  return <DashboardClient members={members} topMeals={topMeals} />;
}
