import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { CreateMealPlanForm } from './components/CreateMealPlanForm';

export const metadata: Metadata = {
  title: 'Nieuw weekmenu | NutriCoach',
  description: 'Maak een nieuw weekmenu aan',
};

/**
 * New meal plan page
 */
export default async function NewMealPlanPage() {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nieuw weekmenu</h1>
        <p className="text-muted-foreground">
          Genereer een nieuw weekmenu op basis van je dieetprofiel
        </p>
      </div>

      <CreateMealPlanForm />
    </div>
  );
}
