import type React from 'react';

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Bottom margin; defaults to mb-6. Use mb-8 for pages with fewer sections. */
  className?: string;
};

/**
 * Canonical page header — Tailwind UI pattern.
 * - Mobile: title/subtitle above actions
 * - Desktop: actions right-aligned with title row
 * - Semantic tokens: text-foreground, text-muted-foreground
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={className ?? 'mb-6'}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="mt-4 flex flex-shrink-0 flex-wrap gap-3 sm:mt-0 sm:ml-auto">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
