import { createClient } from "@/src/lib/supabase/server";
import { redirect } from "next/navigation";
import { listRunsAction } from "./actions/runs.actions";
import { RunsTable } from "./components/RunsTable";

export default async function RunsPage() {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch runs
  const result = await listRunsAction(50);

  if (!result.ok) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-4">Runs</h1>
        <div className="text-destructive">
          Fout: {result.error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Meal Plan Runs</h1>
      <p className="text-muted-foreground mb-6">
        Overzicht van alle meal plan generaties en regeneraties. Laatste 50 runs.
      </p>
      <RunsTable runs={result.data} />
    </div>
  );
}
