import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Link } from '@/components/catalyst/link';

export const metadata: Metadata = {
  title: 'Nieuw weekmenu | NutriCoach',
  description: 'Maak een nieuw weekmenu aan',
};

/**
 * New meal plan page – Coming soon placeholder
 * Meal plan generation is temporarily disabled.
 */
export default async function NewMealPlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 sm:px-6 lg:px-8">
      <div>
        <Heading level={1}>Nieuw weekmenu</Heading>
        <Text className="mt-2 text-muted-foreground">
          Maak een nieuw weekmenu op basis van je dieetprofiel
        </Text>
      </div>

      <div className="rounded-2xl bg-muted/20 p-6 shadow-sm">
        <Heading level={2}>Binnenkort beschikbaar</Heading>
        <Text className="mt-2 text-muted-foreground">
          Weekmenu-generatie is tijdelijk uitgeschakeld. Deze functie komt
          binnenkort weer beschikbaar. Tot die tijd kun je bestaande
          weekmenu&apos;s bekijken en beheren.
        </Text>
        <Link
          href="/meal-plans"
          className="mt-4 inline-block text-sm font-medium text-foreground underline hover:no-underline"
        >
          Terug naar weekmenu&apos;s
        </Link>
      </div>
    </div>
  );
}
