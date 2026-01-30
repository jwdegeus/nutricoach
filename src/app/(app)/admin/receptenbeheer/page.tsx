import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { ReceptenbeheerClient } from './components/ReceptenbeheerClient';

export const metadata = {
  title: 'Receptenbeheer | NutriCoach Admin',
  description: 'Beheer recept bronnen, categorieën, tags en keukens',
};

export default async function ReceptenbeheerPage() {
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

  return <ReceptenbeheerClient />;
}
