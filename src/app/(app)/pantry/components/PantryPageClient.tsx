'use client';

import { useRouter } from 'next/navigation';
import { PantrySearchAdd } from './PantrySearchAdd';
import { PantryList } from './PantryList';
import type { NutriScoreGrade } from '@/src/lib/nevo/nutrition-calculator';
import type { GroceryStoreRow } from '@/src/lib/grocery-stores/grocery-stores.types';
import type { PantryLocation } from '@/src/lib/pantry/pantry.types';

type PantryItemWithName = {
  id: string;
  nevoCode: string | null;
  barcode: string | null;
  source: 'openfoodfacts' | 'albert_heijn' | null;
  displayName: string | null;
  name: string;
  availableG: number | null;
  isAvailable: boolean;
  nutriscore: NutriScoreGrade | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  storageLocationId?: string | null;
  preferredStoreId?: string | null;
};

type PantryPageClientProps = {
  items: PantryItemWithName[];
  groceryStores: GroceryStoreRow[];
  pantryLocations: PantryLocation[];
};

export function PantryPageClient({
  items,
  groceryStores,
  pantryLocations,
}: PantryPageClientProps) {
  const router = useRouter();

  const handleUpdate = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <PantrySearchAdd />
      <PantryList
        items={items}
        groceryStores={groceryStores}
        pantryLocations={pantryLocations}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
