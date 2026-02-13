/**
 * Dashboard loading skeleton – streams immediately while getDashboardData fetches.
 * Matches DashboardClient layout: header, filter, KPI cards, bento chart grid.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col py-4 sm:py-6">
      {/* PageHeader skeleton */}
      <div className="space-y-1">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted-foreground/20" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted-foreground/10" />
      </div>

      {/* Filter row skeleton */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="h-10 w-24 animate-pulse rounded-lg bg-muted-foreground/20" />
        <div
          className="h-10 w-32 animate-pulse rounded-lg bg-muted-foreground/10"
          style={{ animationDelay: '50ms' }}
        />
        <div
          className="h-10 w-28 animate-pulse rounded-lg bg-muted-foreground/10"
          style={{ animationDelay: '100ms' }}
        />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-lg bg-muted/30 p-6 shadow-sm"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="h-4 w-24 animate-pulse rounded bg-muted-foreground/20" />
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted-foreground/20" />
            <div className="mt-1 h-3 w-20 animate-pulse rounded bg-muted-foreground/10" />
          </div>
        ))}
      </div>

      {/* Chart widgets bento grid */}
      <div className="mt-6 grid w-full flex-1 gap-4 lg:grid-cols-2">
        {/* Calories — full width */}
        <div
          className="flex min-h-[320px] flex-col rounded-lg bg-muted/30 p-6 shadow-sm sm:p-8 lg:col-span-2"
          aria-hidden
        >
          <div className="h-full min-h-[280px] animate-pulse rounded-lg bg-muted-foreground/20" />
        </div>
        {/* Vitamins */}
        <div
          className="flex min-h-[280px] flex-col rounded-lg bg-muted/30 p-6 shadow-sm sm:p-8"
          aria-hidden
        >
          <div className="h-full min-h-[240px] animate-pulse rounded-lg bg-muted-foreground/20" />
        </div>
        {/* Minerals */}
        <div
          className="flex min-h-[280px] flex-col rounded-lg bg-muted/30 p-6 shadow-sm sm:p-8"
          aria-hidden
        >
          <div className="h-full min-h-[240px] animate-pulse rounded-lg bg-muted-foreground/20" />
        </div>
        {/* Supplements */}
        <div
          className="flex min-h-[280px] flex-col rounded-lg bg-muted/30 p-6 shadow-sm sm:p-8"
          aria-hidden
        >
          <div className="h-full min-h-[240px] animate-pulse rounded-lg bg-muted-foreground/20" />
        </div>
        {/* Top meals — full width */}
        <div
          className="flex min-h-[240px] flex-col rounded-lg bg-muted/30 p-6 shadow-sm sm:p-8 lg:col-span-2"
          aria-hidden
        >
          <div className="h-full min-h-[200px] animate-pulse rounded-lg bg-muted-foreground/20" />
        </div>
      </div>
    </div>
  );
}
