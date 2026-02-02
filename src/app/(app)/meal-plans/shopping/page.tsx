import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { MealPlansService } from '@/src/lib/meal-plans/mealPlans.service';

/**
 * Shopping page redirect
 *
 * If the user has at least one meal plan, redirect to the most recent plan's
 * shopping list. Otherwise redirect to new meal plan creation.
 */
export default async function ShoppingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const service = new MealPlansService();
  const plans = await service.listPlansForUser(user.id, 1);

  if (plans.length > 0) {
    redirect(`/meal-plans/${plans[0].id}/shopping`);
  }

  redirect('/meal-plans/new');
}
