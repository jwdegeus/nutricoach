import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { ProductSourcesAdminClient } from './components/ProductSourcesAdminClient';

export const metadata = {
  title: 'Productbronnen voorraad | NutriCoach Admin',
  description:
    'Beheer productbronnen voor barcode- en zoeklookup (Open Food Facts, Albert Heijn)',
};

export default async function AdminProductSourcesPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Productbronnen voorraad
        </h1>
        <p className="mt-1 text-muted-foreground">
          Bronnen voor productlookup bij scannen en zoeken in de voorraad
        </p>
      </div>
      <ProductSourcesAdminClient />
    </div>
  );
}
