import { Text } from '@/components/catalyst/text';

type MealPlanProvenanceProps = {
  cronJobId: string | null;
};

/**
 * Compact meta row: provenance "Aangemaakt door: Cron job" when plan was created by a cron job.
 */
export function MealPlanProvenance({ cronJobId }: MealPlanProvenanceProps) {
  if (!cronJobId || cronJobId.length === 0) return null;

  const shortId = `${cronJobId.slice(0, 8)}…`;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <Text>Aangemaakt door: Cron job</Text>
      <span className="text-zinc-300 dark:text-zinc-600">·</span>
      <Text>Job: {shortId}</Text>
    </div>
  );
}
