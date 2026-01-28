/**
 * Raw data types - as they come from the database/API
 */

export type RawKPI = {
  id: string;
  metric: string;
  value: number;
  previousValue?: number;
  period: 'week' | 'month' | 'year';
  periodLabel: string;
};

export type RawActivity = {
  id: string;
  type: 'client' | 'meal_plan' | 'appointment' | 'payment' | 'other';
  description: string;
  timestamp: Date | string;
  userId?: string;
  userName?: string;
};

/**
 * ViewModel types - as they are used by the UI components
 */

export type KPIDelta = {
  value: number;
  label: string;
};

export type KPIViewModel = {
  name: string;
  stat: string | number;
  delta?: KPIDelta;
};

export type ActivityViewModel = {
  id: string;
  type: string;
  description: string;
  timestamp: Date | string;
  user?: string;
};

/**
 * Dashboard data contract
 */

export type DashboardData = {
  kpis: RawKPI[];
  activities: RawActivity[];
};

export type DashboardViewModel = {
  kpis: KPIViewModel[];
  activities: ActivityViewModel[];
};
