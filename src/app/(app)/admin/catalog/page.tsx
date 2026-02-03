import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

export const metadata = {
  title: 'Catalog opties | NutriCoach Admin',
  description: 'Beheer system catalog opties (keuken, proteïne-type)',
};

/**
 * Catalog-beheer is verplaatst naar Receptenbeheer > Classificatie beheer.
 * Canonical entry: /admin/receptenbeheer?tab=keukens.
 * Redirect oude links; geen UI render (redirect() throwt).
 */
export default async function AdminCatalogPage() {
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

  redirect('/admin/receptenbeheer?tab=keukens');
}
