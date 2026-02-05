/**
 * Next.js route segment loader – toont tijdens navigatie naar receptenindex (filterwijzigingen).
 * Skeleton matcht de echte UI: tabs, zoekveld + 6 filter-chips, teller, grid met receptkaarten.
 */
export default function RecipesIndexLoading() {
  return (
    <div className="space-y-6">
      {/* Tabs: Alles / Opgeslagen / Recent */}
      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-700">
        <div className="h-9 w-16 rounded-t bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        <div
          className="h-9 w-20 rounded-t bg-zinc-100 dark:bg-zinc-800 animate-pulse"
          style={{ animationDelay: '50ms' }}
        />
        <div
          className="h-9 w-14 rounded-t bg-zinc-100 dark:bg-zinc-800 animate-pulse"
          style={{ animationDelay: '100ms' }}
        />
      </div>

      {/* Zoekveld + filter-chips (zelfde layout als RecipesIndexClient) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px] flex gap-2">
            <div className="flex-1 min-h-10 rounded-lg bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            <div
              className="h-10 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-700 animate-pulse"
              style={{ animationDelay: '75ms' }}
            />
          </div>
          <div className="hidden sm:flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-9 w-24 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"
                style={{ animationDelay: `${i * 40}ms` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Teller: "X recepten" */}
      <div className="h-4 w-20 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />

      {/* Grid:zelfde responsive kolommen als echte lijst; kaarten lijken op MealCard (h-36 image, p-4 content) */}
      <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-x-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <li key={i} className="h-[320px]">
            <div className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xs">
              {/* Thumbnail (zelfde hoogte als MealCardThumbnail) */}
              <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-t-lg rounded-b-sm bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
              {/* Content (p-4, title + badges + bron) */}
              <div className="flex min-h-0 flex-1 flex-col p-4">
                <div
                  className="h-5 w-4/5 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse"
                  style={{ animationDelay: `${i * 30}ms` }}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div
                    className="h-5 w-14 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
                    style={{ animationDelay: `${i * 30 + 20}ms` }}
                  />
                  <div
                    className="h-4 w-12 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
                    style={{ animationDelay: `${i * 30 + 40}ms` }}
                  />
                  <div
                    className="h-4 w-16 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
                    style={{ animationDelay: `${i * 30 + 60}ms` }}
                  />
                </div>
                <div
                  className="mt-auto pt-1 h-3 w-3/4 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
                  style={{ animationDelay: `${i * 30 + 80}ms` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
