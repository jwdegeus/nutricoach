import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/src/lib/supabase/server';
import {
  getGroceryStoreAction,
  listOrdersByStoreAction,
} from '../actions/grocery-stores.actions';
import { GroceryStoreDetailClient } from './components/GroceryStoreDetailClient';

type Props = { params: Promise<{ storeId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeId } = await params;
  const result = await getGroceryStoreAction(storeId);
  const name = result.ok ? result.store.name : 'Winkel';
  return {
    title: `${name} | Supermarkten | NutriCoach`,
    description: `Bestellingen en gegevens voor ${name}`,
  };
}

export default async function GroceryStoreDetailPage({ params }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { storeId } = await params;
  const storeResult = await getGroceryStoreAction(storeId);
  if (!storeResult.ok) {
    notFound();
  }

  const ordersResult = await listOrdersByStoreAction(storeId);
  const orders = ordersResult.ok ? ordersResult.orders : [];

  return (
    <GroceryStoreDetailClient
      store={storeResult.store}
      initialOrders={orders}
    />
  );
}
