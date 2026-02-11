import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type KPICardProps = {
  name: string;
  stat: string | number;
  delta?: {
    value: number;
    label: string;
  };
  isLoading?: boolean;
};

export function KPICard({ name, stat, delta, isLoading }: KPICardProps) {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow-sm sm:p-6 dark:bg-gray-800/75">
        <div className="mb-2 h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-8 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  const DeltaIcon = delta
    ? delta.value > 0
      ? ArrowUp
      : delta.value < 0
        ? ArrowDown
        : Minus
    : null;

  return (
    <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow-sm sm:p-6 dark:bg-gray-800/75">
      <dt className="flex items-center justify-between truncate text-sm font-medium text-gray-500 dark:text-gray-400">
        <span>{name}</span>
        {DeltaIcon && delta && (
          <DeltaIcon
            className={cn(
              'ml-2 h-4 w-4 shrink-0',
              delta.value > 0 && 'text-green-600 dark:text-green-400',
              delta.value < 0 && 'text-red-600 dark:text-red-400',
              delta.value === 0 && 'text-gray-400 dark:text-gray-500',
            )}
          />
        )}
      </dt>
      <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
        {stat}
      </dd>
      {delta && (
        <dd className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span
            className={cn(
              delta.value > 0 && 'text-green-600 dark:text-green-400',
              delta.value < 0 && 'text-red-600 dark:text-red-400',
              delta.value === 0 && 'text-gray-500 dark:text-gray-400',
            )}
          >
            {delta.value > 0 ? '+' : ''}
            {delta.value}% {delta.label}
          </span>
        </dd>
      )}
    </div>
  );
}
