'use client';

import type React from 'react';

/**
 * Custom tooltip for Recharts that uses theme tokens (bg-muted, border, text-foreground).
 * Recharts default tooltip shows white in portals — this ensures correct theming.
 */
type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    dataKey: string;
    color: string;
  }>;
  label?: string;
  formatter?: (
    value: number,
    name: string,
    entry: unknown,
    index: number,
    payload: unknown[],
  ) => [React.ReactNode, string] | React.ReactNode | void;
  labelFormatter?: (label: string, payload: unknown[]) => string;
};

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const displayLabel =
    labelFormatter && label ? labelFormatter(label, payload) : label;

  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2 shadow-sm">
      <p className="mb-1.5 text-sm font-medium text-foreground">
        {displayLabel}
      </p>
      <div className="space-y-0.5">
        {payload.map(
          (
            entry: {
              name: string;
              value: number;
              dataKey: string;
              color: string;
            },
            i: number,
          ) => {
            const formatted = formatter
              ? formatter(entry.value, entry.name, entry, i, payload)
              : null;
            const [displayValue, displayName] = Array.isArray(formatted)
              ? [formatted[0], formatted[1] ?? entry.name]
              : [entry.value, entry.name];
            return (
              <div
                key={entry.dataKey}
                className="flex items-center justify-between gap-4 text-xs"
              >
                <span className="shrink-0" style={{ color: entry.color }}>
                  {displayName}
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {displayValue}
                </span>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
