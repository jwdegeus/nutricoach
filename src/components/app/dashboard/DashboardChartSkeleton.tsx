/**
 * Fixed-height skeleton for lazy-loaded chart widgets.
 * Prevents layout shift; Catalyst/Tailwind style (no borders).
 */
export function DashboardChartSkeleton({
  minHeight = 280,
}: {
  minHeight?: number;
}) {
  return (
    <div
      className="flex h-full flex-col p-6 sm:p-8"
      style={{ minHeight: `${minHeight}px` }}
      aria-hidden
    >
      <div className="flex flex-1 animate-pulse items-center justify-center rounded-lg bg-muted-foreground/20" />
    </div>
  );
}
