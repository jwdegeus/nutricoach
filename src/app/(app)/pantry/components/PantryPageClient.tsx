'use client';

import { useRouter } from 'next/navigation';
import { PantrySearchAdd } from './PantrySearchAdd';
import { PantryList } from './PantryList';
import type { NutriScoreGrade } from '@/src/lib/nevo/nutrition-calculator';

type PantryItemWithName = {
  id: string;
  nevoCode: string;
  name: string;
  availableG: number | null;
  isAvailable: boolean;
  nutriscore: NutriScoreGrade | null;
};

type PantryPageClientProps = {
  items: PantryItemWithName[];
};

export function PantryPageClient({ items }: PantryPageClientProps) {
  const router = useRouter();

  const handleUpdate = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <PantrySearchAdd />
      <PantryList items={items} onUpdate={handleUpdate} />
    </div>
  );
}
