import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { loadMealPlanAction } from '../../actions/mealPlans.actions';
import { ShoppingListView } from '../../shopping/components/ShoppingListView';
import { MealPlannerShoppingService } from '@/src/lib/agents/meal-planner';
import { PantryService } from '@/src/lib/pantry/pantry.service';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';

export const metadata: Metadata = {
  title: 'Wekelijkse Boodschappen | NutriCoach',
  description:
    'Bekijk je wekelijkse boodschappenlijst op basis van je weekmenu',
};

type PageProps = {
  params: Promise<{ planId: string }>;
};

/**
 * Shopping page for a persisted meal plan
 */
export default async function PlanShoppingPage({ params }: PageProps) {
  const { planId } = await params;

  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Load meal plan
  const planResult = await loadMealPlanAction(planId);

  if (!planResult.ok) {
    if (planResult.error.code === 'AUTH_ERROR') {
      redirect('/login');
    }
    notFound();
  }

  const planRecord = planResult.data;
  const plan = planRecord.planSnapshot;

  // Build shopping list and coverage with pantry
  const shoppingService = new MealPlannerShoppingService();
  const [shoppingList, coverage] = await Promise.all([
    shoppingService.buildShoppingListWithPantry(plan, user.id),
    shoppingService.buildCoverageWithPantry(plan, user.id),
  ]);

  // Load pantry availability for all items to show what's in pantry
  const pantryService = new PantryService();
  const allNevoCodes = shoppingList.groups.flatMap((group) =>
    group.items.map((item) => item.nevoCode),
  );
  const pantryAvailability = await pantryService.loadAvailabilityByNevoCodes(
    user.id,
    allNevoCodes,
  );

  // Create an object for quick lookup (serializable for client component)
  const pantryMap: Record<
    string,
    { availableG?: number; isAvailable?: boolean }
  > = {};
  for (const item of pantryAvailability) {
    pantryMap[item.nevoCode] = {
      availableG: item.availableG,
      isAvailable: item.isAvailable,
    };
  }

  // Calculate end date for display
  const startDate = new Date(planRecord.dateFrom);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + planRecord.days - 1);
  const endDateStr = endDate.toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div>
        <Heading level={1}>Wekelijkse Boodschappen</Heading>
        <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
          Periode: {planRecord.dateFrom} tot {endDateStr} ({planRecord.days}{' '}
          dagen)
        </Text>
        <Text className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
          Deze lijst toont alleen items die je nog moet kopen. Items die al in
          je pantry zitten worden automatisch uitgesloten.
        </Text>
      </div>

      <ShoppingListView
        shoppingList={shoppingList}
        coverage={coverage}
        pantryMap={pantryMap}
      />
    </div>
  );
}
