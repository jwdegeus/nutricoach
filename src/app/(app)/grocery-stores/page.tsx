import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/src/lib/supabase/server';
import { listGroceryStoresAction } from './actions/grocery-stores.actions';
import { GroceryStoresPageClient } from './components/GroceryStoresPageClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('groceryStores');
  return {
    title: `${t('title')} | NutriCoach`,
    description: t('description'),
  };
}

export default async function GroceryStoresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const result = await listGroceryStoresAction();
  const stores = result.ok ? result.stores : [];

  const t = await getTranslations('groceryStores');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <GroceryStoresPageClient initialStores={stores} />
    </div>
  );
}
