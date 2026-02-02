/**
 * Next.js route segment loader – toont tijdens navigatie naar receptenindex (filterwijzigingen).
 */
export default function RecipesIndexLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-9 w-48 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        <div className="h-10 w-32 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
      </div>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-9 w-20 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-3"
            >
              <div className="h-5 w-3/4 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                <div className="h-5 w-12 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
              </div>
              <div className="h-4 w-1/2 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
