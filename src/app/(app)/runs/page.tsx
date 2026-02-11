import { createClient } from '@/src/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listRunsAction } from './actions/runs.actions';
import { RunsTable } from './components/RunsTable';

export default async function RunsPage() {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch runs
  const result = await listRunsAction(50);

  if (!result.ok) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="mb-4 text-2xl font-bold">Runs</h1>
        <div className="text-destructive">Fout: {result.error.message}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="mb-4 text-2xl font-bold">Weekmenu runs</h1>
      <p className="mb-6 text-muted-foreground">
        Overzicht van alle weekmenu-generaties en -regeneraties. Laatste 50
        runs.
      </p>
      <RunsTable runs={result.data} />
    </div>
  );
}
