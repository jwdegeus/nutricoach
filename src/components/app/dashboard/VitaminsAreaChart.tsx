'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslations } from 'next-intl';
import type { VitaminDay } from './DashboardChartData';
import { ChartTooltip } from './ChartTooltip';
import { ChevronRightIcon } from '@heroicons/react/16/solid';

/** Primary palette tints only */
const VITAMIN_COLORS = {
  vitamineA: 'var(--color-primary-500)',
  vitamineC: 'var(--color-primary-400)',
  vitamineD: 'var(--color-primary-600)',
  vitamineE: 'var(--color-primary-300)',
  vitamineB12: 'var(--color-primary-700)',
} as const;

const VITAMIN_KEYS = [
  'vitamineA',
  'vitamineC',
  'vitamineD',
  'vitamineE',
  'vitamineB12',
] as const;

const VITAMIN_LABELS: Record<string, string> = {
  vitamineA: 'Vit. A',
  vitamineC: 'Vit. C',
  vitamineD: 'Vit. D',
  vitamineE: 'Vit. E',
  vitamineB12: 'Vit. B12',
};

type Props = { data: VitaminDay[] };

export function VitaminsAreaChart({ data }: Props) {
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
          {t('vitaminsPercent')}
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
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              {VITAMIN_KEYS.map((key) => (
                <linearGradient
                  key={key}
                  id={`grad-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={VITAMIN_COLORS[key]}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor={VITAMIN_COLORS[key]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
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
              domain={[0, 120]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={<ChartTooltip />}
              wrapperStyle={{
                outline: 'none',
                backgroundColor: 'transparent',
              }}
              formatter={(value, name) => [
                `${value ?? 0}%`,
                VITAMIN_LABELS[name ?? ''] ?? name ?? '',
              ]}
            />
            {VITAMIN_KEYS.map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={VITAMIN_COLORS[key]}
                fill={`url(#grad-${key})`}
                strokeWidth={2}
                name={key}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{dateRange}</p>
    </div>
  );
}
