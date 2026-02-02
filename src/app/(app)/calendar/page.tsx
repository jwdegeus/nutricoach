/**
 * Calendar Page
 *
 * Calendar view showing all meals from all meal plans per day
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { MealPlansService } from '@/src/lib/meal-plans/mealPlans.service';
import { CalendarView } from './components/CalendarView';

export default async function CalendarPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Load all meal plans for the user
  const mealPlansService = new MealPlansService();
  const plans = await mealPlansService.listPlansForUser(user.id, 50); // Get more plans for calendar

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">
          Maaltijd Kalender
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Bekijk alle maaltijden per dag uit al je weekmenu&apos;s
        </p>
      </div>

      <CalendarView plans={plans} />
    </div>
  );
}
