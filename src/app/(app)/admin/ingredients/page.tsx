import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { AdminIngredientsPageClient } from './components/AdminIngredientsPageClient';

export const metadata = {
  title: 'Ingrediënten en groepen | NutriCoach Admin',
  description:
    'Beheer NEVO- en eigen ingrediënten en ingredientgroepen (categorieën)',
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

  return <AdminIngredientsPageClient />;
}
