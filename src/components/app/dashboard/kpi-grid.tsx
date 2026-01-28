import { KPICard, type KPICardProps } from './kpi-card';
import { cn } from '@/src/lib/utils';

type KPIGridProps = {
  kpis: KPICardProps[];
  isLoading?: boolean;
  title?: string;
};

export function KPIGrid({ kpis, isLoading, title }: KPIGridProps) {
  return (
    <div>
      {title && (
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
      )}
      <dl
        className={cn(
          title ? 'mt-5' : '',
          'grid grid-cols-1 gap-5',
          kpis.length === 2
            ? 'sm:grid-cols-2'
            : kpis.length === 3
              ? 'sm:grid-cols-3'
              : 'sm:grid-cols-2 lg:grid-cols-4',
        )}
      >
        {isLoading
          ? [...Array(4)].map((_, i) => (
              <div key={i}>
                <KPICard name="" stat={0} isLoading={true} />
              </div>
            ))
          : kpis.map((kpi, index) => (
              <div key={index}>
                <KPICard {...kpi} />
              </div>
            ))}
      </dl>
    </div>
  );
}
