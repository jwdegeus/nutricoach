import type {
  RawKPI,
  RawActivity,
  KPIViewModel,
  ActivityViewModel,
  DashboardData,
  DashboardViewModel,
} from './dashboard.types';

/**
 * Maps raw KPI data to view model for UI consumption
 */
function mapKPI(raw: RawKPI): KPIViewModel {
  const metricLabels: Record<string, { title: string; description: string }> = {
    total_clients: {
      title: 'Total Clients',
      description: 'Active clients',
    },
    active_meal_plans: {
      title: 'Meal Plans',
      description: 'Active plans',
    },
    appointments_this_week: {
      title: 'Appointments',
      description: 'This week',
    },
    revenue_this_month: {
      title: 'Revenue',
      description: 'This month',
    },
  };

  const label = metricLabels[raw.metric] || {
    title: raw.metric,
    description: '',
  };

  // Calculate delta percentage if previous value exists
  let delta: KPIViewModel['delta'] | undefined;
  if (raw.previousValue !== undefined && raw.previousValue !== 0) {
    const deltaValue =
      ((raw.value - raw.previousValue) / raw.previousValue) * 100;
    delta = {
      value: Math.round(deltaValue * 10) / 10, // Round to 1 decimal
      label: raw.periodLabel,
    };
  }

  // Format value based on metric type
  let formattedValue: string | number = raw.value;
  if (raw.metric === 'revenue_this_month') {
    formattedValue = `€${raw.value.toLocaleString()}`;
  }

  return {
    name: label.title,
    stat: formattedValue,
    delta,
  };
}

/**
 * Maps raw activity data to view model for UI consumption
 */
function mapActivity(raw: RawActivity): ActivityViewModel {
  const typeLabels: Record<string, string> = {
    client: 'Client',
    meal_plan: 'Meal Plan',
    appointment: 'Appointment',
    payment: 'Payment',
    other: 'Other',
  };

  return {
    id: raw.id,
    type: typeLabels[raw.type] || raw.type,
    description: raw.description,
    timestamp: raw.timestamp,
    user: raw.userName,
  };
}

/**
 * Maps raw dashboard data to view model
 */
export function mapDashboardData(data: DashboardData): DashboardViewModel {
  return {
    kpis: data.kpis.map(mapKPI),
    activities: data.activities.map(mapActivity),
  };
}
