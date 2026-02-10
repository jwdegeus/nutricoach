import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/components/catalyst/link';
import { createClient } from '@/src/lib/supabase/server';
import { loadUserPantryAction } from './actions/pantry-ui.actions';
import { listUserPantryLocationsAction } from './actions/pantry-locations.actions';
import { listGroceryStoresAction } from '@/src/app/(app)/grocery-stores/actions/grocery-stores.actions';
import {
  getNevoFoodByCode,
  calculateNutriScore,
} from '@/src/lib/nevo/nutrition-calculator';
import { PantryPageClient } from './components/PantryPageClient';
import { Cog6ToothIcon } from '@heroicons/react/16/solid';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pantry');
  return {
    title: `${t('title')} | NutriCoach`,
    description: t('description'),
  };
}

export default async function PantryPage() {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Load pantry items, locations, and grocery stores
  const [pantryResult, locationsResult, storesResult] = await Promise.all([
    loadUserPantryAction(),
    listUserPantryLocationsAction(),
    listGroceryStoresAction(),
  ]);
  const pantryItems = pantryResult.ok ? pantryResult.data : [];
  const pantryLocations = locationsResult.ok ? locationsResult.data : [];
  const groceryStores = storesResult.ok ? storesResult.stores : [];

  // Enrich with names and nutriscore: NEVO lookup for nevoCode items, displayName for external
  const itemsWithNames = await Promise.all(
    pantryItems.map(async (item) => {
      if (item.displayName != null && item.displayName.trim() !== '') {
        return { ...item, name: item.displayName.trim(), nutriscore: null };
      }
      if (item.nevoCode == null || item.nevoCode.trim() === '') {
        return { ...item, name: 'Onbekend product', nutriscore: null };
      }
      try {
        const codeNum = parseInt(item.nevoCode, 10);
        if (isNaN(codeNum)) {
          return { ...item, name: 'Onbekend ingrediënt', nutriscore: null };
        }
        const food = await getNevoFoodByCode(codeNum);
        const name =
          String((food as Record<string, unknown>)?.name_nl ?? '').trim() ||
          String((food as Record<string, unknown>)?.name_en ?? '').trim() ||
          'Onbekend ingrediënt';
        const nutriscore = food ? calculateNutriScore(food) : null;
        return { ...item, name, nutriscore };
      } catch {
        return { ...item, name: 'Onbekend ingrediënt', nutriscore: null };
      }
    }),
  );

  const t = await getTranslations('pantry');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Link
          href="/pantry/settings"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground"
        >
          <Cog6ToothIcon className="size-4" />
          {t('settingsTitle')}
        </Link>
      </div>

      <PantryPageClient
        items={itemsWithNames}
        groceryStores={groceryStores}
        pantryLocations={pantryLocations}
      />
    </div>
  );
}
