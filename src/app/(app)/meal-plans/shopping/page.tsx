import { redirect } from 'next/navigation';

/**
 * Shopping page redirect
 *
 * This page redirects to the new meal plan creation page.
 * Shopping lists are only available for existing meal plans.
 */
export default async function ShoppingPage() {
  // Redirect to new meal plan page
  redirect('/meal-plans/new');
}
