import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { IngredientsAdminClient } from './components/IngredientsAdminClient';

export const metadata = {
  title: 'Ingrediënten (NEVO) | NutriCoach Admin',
  description: 'Bekijk NEVO-ingrediënten en beheer eigen ingredienten',
};

export default async function AdminIngredientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) {
    redirect('/dashboard');
  }

  return <IngredientsAdminClient />;
}
