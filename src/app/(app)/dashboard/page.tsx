import type { Metadata } from 'next';
import { DashboardClient } from '@/src/components/app/dashboard/DashboardClient';
import { getDashboardData } from './dashboard.loader';

/** User-specific; no static/cross-request caching to avoid data leaks */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard | NutriCoach',
  description: 'NutriCoach Dashboard Overview',
};

export default async function DashboardPage() {
  const { topMeals, members } = await getDashboardData();
  return <DashboardClient members={members} topMeals={topMeals} />;
}
