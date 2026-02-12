'use client';

import { Link } from '@/components/catalyst/link';
import { Badge } from '@/components/catalyst/badge';
import { IngredientEditForm } from '../../components/IngredientEditForm';
import { LinkIngredientToProductSection } from '../../components/LinkIngredientToProductSection';
import { ArrowLeftIcon } from '@heroicons/react/20/solid';

type FnddsIngredientDetailPageClientProps = {
  id: string;
  item: Record<string, unknown> & { source: 'fndds_survey' };
};

export function FnddsIngredientDetailPageClient({
  id,
  item,
}: FnddsIngredientDetailPageClientProps) {
  const name = String(item.name_nl ?? item.name_en ?? 'FNDDS-ingrediënt');

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/ingredients"
              className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
              aria-label="Terug naar ingrediënten"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
                  {name}
                </h1>
                <Badge color="zinc">FNDDS</Badge>
              </div>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                Bewerk FNDDS-ingrediënt. FDC-id: {id}
              </p>
            </div>
          </div>
        </div>

        <LinkIngredientToProductSection ingredientName={name} />

        <IngredientEditForm
          source="fndds_survey"
          id={id}
          initialData={item}
          showEnrich={true}
        />
      </div>
    </div>
  );
}
