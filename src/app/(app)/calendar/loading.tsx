export default function CalendarLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-48 animate-pulse rounded bg-muted/50" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted/30" />
      </div>
      <div className="flex min-h-[400px] items-center justify-center rounded-lg bg-muted/20">
        <p className="text-sm text-muted-foreground">Kalender laden...</p>
      </div>
    </div>
  );
}
