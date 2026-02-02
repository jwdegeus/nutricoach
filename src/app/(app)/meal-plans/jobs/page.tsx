import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { listMealPlanJobsForUserAction } from './actions/mealPlanJobs.actions';
import type { JobRow } from './actions/mealPlanJobs.actions';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Link } from '@/components/catalyst/link';
import { JobsTableClient } from './components/JobsTableClient';

export const metadata: Metadata = {
  title: 'Weekmenu Jobs | NutriCoach',
  description: 'Overzicht van geplande en uitgevoerde weekmenu-generatie jobs',
};

function formatScheduledFor(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Minimal columns for last cron tick (no SELECT *) */
const CRON_TICK_SELECT = 'ran_at,outcome,status';

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Gepland',
  running: 'Bezig',
  succeeded: 'Gelukt',
  failed: 'Mislukt',
  cancelled: 'Geannuleerd',
};

function statusBadgeColor(
  status: string,
): 'yellow' | 'blue' | 'green' | 'red' | 'zinc' {
  switch (status) {
    case 'scheduled':
      return 'yellow';
    case 'running':
      return 'blue';
    case 'succeeded':
      return 'green';
    case 'failed':
      return 'red';
    case 'cancelled':
      return 'zinc';
    default:
      return 'zinc';
  }
}

function weekFromSnapshot(snapshot: JobRow['requestSnapshot']): string {
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    !('week_start' in snapshot)
  ) {
    return '—';
  }
  const ws = (snapshot as { week_start?: unknown }).week_start;
  return typeof ws === 'string' ? ws : '—';
}

export default async function MealPlanJobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [result, tickResult] = await Promise.all([
    listMealPlanJobsForUserAction({ limit: 20 }),
    supabase
      .from('cron_ticks')
      .select(CRON_TICK_SELECT)
      .eq('cron_name', 'meal_plan_jobs')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastTick = tickResult.data as {
    ran_at: string;
    outcome: string | null;
    status: string;
  } | null;
  const tickError = tickResult.error;

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <Heading level={1}>Weekmenu Jobs</Heading>
        <div
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
          role="alert"
        >
          <Text className="font-medium">Fout</Text>
          <Text className="mt-1">{result.error.message}</Text>
        </div>
      </div>
    );
  }

  const jobs = result.data;
  const nowIso = new Date().toISOString();
  const nextScheduled =
    jobs
      .filter((j) => j.status === 'scheduled' && j.scheduledFor > nowIso)
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <div>
          <Heading level={1}>Weekmenu Jobs</Heading>
          <Text className="mt-2 text-muted-foreground">
            Overzicht van geplande en uitgevoerde weekmenu-generatie jobs
          </Text>
          <Text className="mt-2">
            <Link href="/meal-plans/jobs/run-due">Run due job (test)</Link>
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Cron: /api/cron/meal-plan-jobs (1 job per tick)
          </Text>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
          <Text className="font-medium">Laatste cron tick</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {tickError
              ? 'Kon laatste tick niet ophalen.'
              : lastTick
                ? `${formatScheduledFor(lastTick.ran_at)} — ${lastTick.outcome ?? lastTick.status}`
                : 'Nog geen cron ticks.'}
          </Text>
        </div>

        {nextScheduled && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <Text className="font-medium">Volgende geplande job</Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              {formatScheduledFor(nextScheduled.scheduledFor)}
              {weekFromSnapshot(nextScheduled.requestSnapshot) !== '—' &&
                ` · Week ${weekFromSnapshot(nextScheduled.requestSnapshot)}`}
            </Text>
          </div>
        )}

        {jobs.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white py-12 dark:border-zinc-700 dark:bg-zinc-900">
            <Text className="text-center text-muted-foreground">
              Nog geen jobs gepland.
            </Text>
          </div>
        ) : (
          <JobsTableClient
            jobs={jobs}
            formatScheduledFor={formatScheduledFor}
            statusBadgeColor={statusBadgeColor}
            statusLabels={STATUS_LABELS}
            weekFromSnapshot={weekFromSnapshot}
          />
        )}
      </div>
    </div>
  );
}
