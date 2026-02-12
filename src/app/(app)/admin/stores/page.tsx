import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { StoresAdminClient } from './components/StoresAdminClient';
import type { StoreForAdmin } from './actions/stores.actions';

export const metadata = {
  title: 'Winkels & Assortiment | NutriCoach Admin',
  description: 'Beheer winkels en catalog sync (sitemap, producten)',
};

async function getStores(): Promise<StoreForAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stores')
    .select(
      'id, name, base_url, sitemap_url, is_active, connector_config, created_at, updated_at',
    )
    .order('name');
  if (error) return [];
  return (data ?? []) as StoreForAdmin[];
}

export default async function AdminStoresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) redirect('/dashboard');

  const stores = await getStores();

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8">
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Winkels & Assortiment
          </h1>
          <p className="mt-1 text-muted-foreground">
            Beheer winkels en start catalog sync (sitemap → producten)
          </p>
        </div>
        <StoresAdminClient initialStores={stores} />
      </div>
    </div>
  );
}
