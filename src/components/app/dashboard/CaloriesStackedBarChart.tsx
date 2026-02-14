'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTranslations } from 'next-intl';
import type { CaloriesDay } from './DashboardChartData';
import { ChartTooltip } from './ChartTooltip';
import { ChevronRightIcon } from '@heroicons/react/16/solid';

/** Primary palette tints only — Pine Teal from globals.css */
const MACRO_COLORS = {
  protein: 'var(--color-primary-500)',
  carbs: 'var(--color-primary-400)',
  fat: 'var(--color-primary-600)',
  alcohol: 'var(--color-primary-300)',
} as const;

type Props = {
  data: CaloriesDay[];
};

export function CaloriesStackedBarChart({ data }: Props) {
  const t = useTranslations('family.dashboard');

  const formatDate = (d: string) => {
    const [, month, day] = d.split('-');
    const months = [
      'jan',
      'feb',
      'mrt',
      'apr',
      'mei',
      'jun',
      'jul',
      'aug',
      'sep',
      'okt',
      'nov',
      'dec',
    ];
    return `${day} ${months[parseInt(month!, 10) - 1]}`;
  };

  const chartData = data.map((row) => ({
    ...row,
    displayDate: formatDate(row.date),
    total: row.proteinKcal + row.carbsKcal + row.fatKcal + row.alcoholKcal,
  }));

  const dateRange =
    data.length >= 2
      ? `${formatDate(data[0]!.date)} – ${formatDate(data[data.length - 1]!.date)}`
      : data[0]
        ? formatDate(data[0].date)
        : '';

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {t('caloriesConsumed') ?? 'Calorie-inname'}
        </h3>
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Meer details"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <div className="relative min-h-[200px] w-full min-w-0 flex-1 basis-0 overflow-hidden sm:min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="displayDate"
              stroke="var(--color-muted-foreground)"
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="var(--color-muted-foreground)"
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
              }
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{
                fill: 'var(--color-muted)',
                radius: 8,
              }}
              wrapperStyle={{
                outline: 'none',
                backgroundColor: 'transparent',
              }}
              formatter={(value) => [value ?? 0, '']}
              labelFormatter={(label) => label}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => (
                <span className="text-xs text-muted-foreground">{value}</span>
              )}
              iconType="square"
              iconSize={10}
            />
            <Bar
              dataKey="proteinKcal"
              stackId="a"
              name={t('protein') ?? 'Eiwit'}
              fill={MACRO_COLORS.protein}
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="carbsKcal"
              stackId="a"
              name={t('carbs') ?? 'Koolhydraten'}
              fill={MACRO_COLORS.carbs}
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="fatKcal"
              stackId="a"
              name={t('fat') ?? 'Vet'}
              fill={MACRO_COLORS.fat}
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="alcoholKcal"
              stackId="a"
              name={t('alcohol') ?? 'Alcohol'}
              fill={MACRO_COLORS.alcohol}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{dateRange}</p>
    </div>
  );
}
