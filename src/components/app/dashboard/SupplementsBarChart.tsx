'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslations } from 'next-intl';
import type { SupplementDay } from './DashboardChartData';
import { ChartTooltip } from './ChartTooltip';
import { ChevronRightIcon } from '@heroicons/react/16/solid';

/** Primary palette tints only */
const SUPP_COLORS = {
  omega3: 'var(--color-primary-500)',
  vitamineD3: 'var(--color-primary-400)',
  magnesium: 'var(--color-primary-600)',
  multivitamine: 'var(--color-primary-300)',
} as const;

const SUPP_KEYS = [
  'omega3',
  'vitamineD3',
  'magnesium',
  'multivitamine',
] as const;

const SUPP_LABELS: Record<string, string> = {
  omega3: 'Omega-3',
  vitamineD3: 'Vit. D3',
  magnesium: 'Magnesium',
  multivitamine: 'Multivitamine',
};

type Props = { data: SupplementDay[] };

export function SupplementsBarChart({ data }: Props) {
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
    avg: (row.omega3 + row.vitamineD3 + row.magnesium + row.multivitamine) / 4,
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
          {t('supplementsCompliance')}
        </h3>
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Meer details"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <div className="min-h-[200px] flex-1">
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
            />
            <YAxis
              stroke="var(--color-muted-foreground)"
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
            />
            <Tooltip
              content={<ChartTooltip />}
              wrapperStyle={{
                outline: 'none',
                backgroundColor: 'transparent',
              }}
              formatter={(value, name) => [
                `${Math.round(Number(value ?? 0) * 100)}%`,
                SUPP_LABELS[name ?? ''] ?? name ?? '',
              ]}
            />
            {SUPP_KEYS.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="supp"
                name={key}
                fill={SUPP_COLORS[key]}
                radius={[0, 4, 4, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{dateRange}</p>
    </div>
  );
}
