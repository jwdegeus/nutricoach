import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { Button } from '@/components/catalyst/button';
import { listMealPlansAction } from './actions/mealPlans.actions';
import { MealPlansTable } from './components/MealPlansTable';

export const metadata: Metadata = {
  title: "Weekmenu's | NutriCoach",
  description: 'Bekijk je weekmenu geschiedenis',
};

export default async function MealPlansPage() {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Load meal plans
  const plansResult = await listMealPlansAction(50);

  if (!plansResult.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Weekmenu&apos;s</h1>
        <div className="text-destructive">
          Fout bij ophalen weekmenu&apos;s: {plansResult.error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Weekmenu&apos;s</h1>
          <p className="text-muted-foreground">
            Overzicht van al je gegenereerde weekmenu&apos;s
          </p>
        </div>
        {plansResult.data.length > 0 && (
          <Button href="/meal-plans/new" color="primary">
            Nieuw weekmenu
          </Button>
        )}
      </div>

      <MealPlansTable plans={plansResult.data} />
    </div>
  );
}
