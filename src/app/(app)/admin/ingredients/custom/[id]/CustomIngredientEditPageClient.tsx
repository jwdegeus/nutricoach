'use client';

import { Badge } from '@/components/catalyst/badge';
import { Link } from '@/components/catalyst/link';
import { IngredientEditForm } from '../../components/IngredientEditForm';
import { ArrowLeftIcon } from '@heroicons/react/20/solid';

type CustomIngredientEditPageClientProps = {
  id: string;
  initialData: Record<string, unknown>;
};

export function CustomIngredientEditPageClient({
  id,
  initialData,
}: CustomIngredientEditPageClientProps) {
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
                  NutriCoach ingrediënt bewerken
                </h1>
                <Badge color={initialData.created_by ? 'amber' : 'zinc'}>
                  {initialData.created_by ? 'AI generated' : 'NutriCoach'}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                Alle velden zijn optioneel behalve Naam (NL). Gebruik AI om
                ontbrekende gegevens voor te stellen. Kies een NEVO-groep om
                duplicaten te voorkomen.
              </p>
            </div>
          </div>
        </div>

        <IngredientEditForm
          source="custom"
          id={id}
          initialData={initialData}
          showEnrich={true}
        />
      </div>
    </div>
  );
}
