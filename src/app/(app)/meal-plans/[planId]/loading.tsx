/**
 * Route-level loading UI voor weekmenu detail.
 * Skeleton: header (2 regels), grid 2 kolommen (Plan Overzicht + Acties), sectie Maaltijden met skeleton cards.
 */
export default function MealPlanDetailLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header: 2 regels */}
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          <div
            className="h-4 w-40 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
            style={{ animationDelay: '50ms' }}
          />
          <div
            className="h-4 w-24 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
            style={{ animationDelay: '100ms' }}
          />
        </div>
      </div>

      {/* Grid: Plan Overzicht + Acties (2 skeleton cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 space-y-4">
          <div className="h-6 w-32 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            <div
              className="h-4 w-4/5 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
              style={{ animationDelay: '30ms' }}
            />
            <div
              className="h-4 w-3/5 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
              style={{ animationDelay: '60ms' }}
            />
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 space-y-4">
          <div className="h-6 w-20 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
          <div className="space-y-3">
            <div className="h-10 w-full rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            <div
              className="h-10 w-full rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
              style={{ animationDelay: '40ms' }}
            />
            <div
              className="h-4 w-64 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
              style={{ animationDelay: '80ms' }}
            />
          </div>
        </div>
      </div>

      {/* Maaltijden: heading + skeleton cards */}
      <div className="space-y-4">
        <div className="h-6 w-28 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3].map((day) => (
            <div key={day} className="space-y-3">
              <div
                className="h-5 w-56 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
                style={{ animationDelay: `${day * 20}ms` }}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((card) => (
                  <div
                    key={card}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4"
                  >
                    <div
                      className="h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse"
                      style={{ animationDelay: `${(day * 3 + card) * 25}ms` }}
                    />
                    <div
                      className="mt-2 h-5 w-3/4 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
                      style={{
                        animationDelay: `${(day * 3 + card) * 25 + 30}ms`,
                      }}
                    />
                    <div
                      className="mt-2 h-4 w-full rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
                      style={{
                        animationDelay: `${(day * 3 + card) * 25 + 60}ms`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
