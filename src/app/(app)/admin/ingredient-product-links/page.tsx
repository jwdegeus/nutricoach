import { redirect } from 'next/navigation';
import { isAdmin } from '@/src/lib/auth/roles';
import { getStoresForShoppingAction } from '@/src/app/(app)/meal-plans/actions/storeProductLinks.actions';
import { IngredientProductLinksClient } from './components/IngredientProductLinksClient';

export const metadata = {
  title: 'Ingrediënt ↔ Product koppelingen | NutriCoach Admin',
  description: 'Beheer voorkeursproducten per canoniek ingrediënt en winkel',
};

type PageProps = {
  searchParams: Promise<{
    canonicalIngredientId?: string;
    storeId?: string;
    storeProductId?: string;
  }>;
};

export default async function AdminIngredientProductLinksPage({
  searchParams,
}: PageProps) {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) {
    redirect('/dashboard');
  }

  const storesResult = await getStoresForShoppingAction();
  const stores = storesResult.ok ? storesResult.data : [];

  const params = await searchParams;
  const initialCanonicalIngredientId =
    typeof params.canonicalIngredientId === 'string' &&
    params.canonicalIngredientId.trim()
      ? params.canonicalIngredientId.trim()
      : undefined;
  const initialStoreId =
    typeof params.storeId === 'string' && params.storeId.trim()
      ? params.storeId.trim()
      : undefined;
  const initialStoreProductId =
    typeof params.storeProductId === 'string' && params.storeProductId.trim()
      ? params.storeProductId.trim()
      : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <IngredientProductLinksClient
        stores={stores}
        initialCanonicalIngredientId={initialCanonicalIngredientId}
        initialStoreId={initialStoreId}
        initialStoreProductId={initialStoreProductId}
      />
    </div>
  );
}
