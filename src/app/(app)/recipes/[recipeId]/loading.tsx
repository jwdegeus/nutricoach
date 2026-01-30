/**
 * Next.js route segment loader – toont tijdens navigatie naar receptdetail.
 */
export default function RecipeDetailLoading() {
  return (
    <div className="mt-6 flex min-h-[50vh] flex-col items-center justify-center gap-6 py-16">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300"
        aria-hidden
      />
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Recept wordt geladen...
      </p>
    </div>
  );
}
