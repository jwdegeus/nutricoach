// This file should only be imported in Server Components
// Using "server-only" package ensures this cannot be imported in Client Components
// Install with: npm install server-only
// import "server-only";

import type { RawKPI, RawActivity, DashboardData } from './dashboard.types';

/**
 * Server-only query functions
 * These will be replaced with real database queries later
 */

/**
 * Fetches KPI data from the database
 * TODO: Replace with real database query
 */
export async function getKPIs(): Promise<RawKPI[]> {
  // Simulate async database call
  await new Promise((resolve) => setTimeout(resolve, 100));

  return [
    {
      id: '1',
      metric: 'total_clients',
      value: 24,
      previousValue: 21.33,
      period: 'month',
      periodLabel: 'from last month',
    },
    {
      id: '2',
      metric: 'active_meal_plans',
      value: 18,
      previousValue: 17.11,
      period: 'week',
      periodLabel: 'from last week',
    },
    {
      id: '3',
      metric: 'appointments_this_week',
      value: 8,
      previousValue: 8.17,
      period: 'week',
      periodLabel: 'from last week',
    },
    {
      id: '4',
      metric: 'revenue_this_month',
      value: 2450,
      previousValue: 2262.15,
      period: 'month',
      periodLabel: 'from last month',
    },
  ];
}

/**
 * Fetches recent activity data from the database
 * TODO: Replace with real database query
 */
export async function getRecentActivities(
  limit: number = 10,
): Promise<RawActivity[]> {
  // Simulate async database call
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Use fixed base timestamp to avoid hydration mismatches
  // This will be replaced with real database queries that return consistent timestamps
  const baseTimestamp = new Date('2024-01-15T12:00:00Z').getTime();
  const now = baseTimestamp;

  const activities: RawActivity[] = [
    {
      id: '1',
      type: 'client' as const,
      description: 'New client registered: John Doe',
      timestamp: new Date(now - 1000 * 60 * 15), // 15 minutes ago
      userId: 'system',
      userName: 'System',
    },
    {
      id: '2',
      type: 'meal_plan' as const,
      description: 'Meal plan created for Jane Smith',
      timestamp: new Date(now - 1000 * 60 * 60 * 2), // 2 hours ago
      userId: 'current-user',
      userName: 'You',
    },
    {
      id: '3',
      type: 'appointment' as const,
      description: 'Appointment scheduled with Mike Johnson',
      timestamp: new Date(now - 1000 * 60 * 60 * 5), // 5 hours ago
      userId: 'current-user',
      userName: 'You',
    },
    {
      id: '4',
      type: 'client' as const,
      description: 'Client profile updated: Sarah Williams',
      timestamp: new Date(now - 1000 * 60 * 60 * 24), // 1 day ago
      userId: 'current-user',
      userName: 'You',
    },
    {
      id: '5',
      type: 'meal_plan' as const,
      description: 'Meal plan completed by Robert Brown',
      timestamp: new Date(now - 1000 * 60 * 60 * 48), // 2 days ago
      userId: 'system',
      userName: 'System',
    },
  ];

  return activities.slice(0, limit);
}

/**
 * Fetches all dashboard data
 * This is the main entry point for dashboard data fetching
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [kpis, activities] = await Promise.all([
    getKPIs(),
    getRecentActivities(10),
  ]);

  return {
    kpis,
    activities,
  };
}
