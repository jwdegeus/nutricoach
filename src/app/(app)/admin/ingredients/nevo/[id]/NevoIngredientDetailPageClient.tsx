'use client';

import { useState } from 'react';
import { Link } from '@/components/catalyst/link';
import { Badge } from '@/components/catalyst/badge';
import { Button } from '@/components/catalyst/button';
import { IngredientEditForm } from '../../components/IngredientEditForm';
import { LinkIngredientToProductModal } from '@/src/app/(app)/admin/ingredient-product-links/components/LinkIngredientToProductModal';
import { ArrowLeftIcon, LinkIcon } from '@heroicons/react/20/solid';

type NevoIngredientDetailPageClientProps = {
  id: string;
  item: Record<string, unknown> & { source: 'nevo' };
  canonicalIngredientId: string | null;
};

export function NevoIngredientDetailPageClient({
  id,
  item,
  canonicalIngredientId,
}: NevoIngredientDetailPageClientProps) {
  const name = String(item.name_nl ?? item.name_en ?? 'NEVO-ingrediënt');
  const [linkModalOpen, setLinkModalOpen] = useState(false);

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
                <Badge color="blue">NEVO</Badge>
              </div>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                Bewerk NEVO-ingrediënt. Code: {id}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-lg bg-muted/20 p-4">
          <p className="mb-2 text-sm text-muted-foreground">
            Koppel dit ingrediënt aan een winkelproduct voor de
            boodschappenlijst.
          </p>
          <Button onClick={() => setLinkModalOpen(true)}>
            <LinkIcon className="mr-2 h-4 w-4" />
            Koppel aan winkelproduct
          </Button>
          {!canonicalIngredientId && (
            <p className="mt-2 text-sm text-muted-foreground">
              Geen canonieke koppeling? In de popup kun je eerst het canonieke
              ingrediënt zoeken op naam.
            </p>
          )}
          <LinkIngredientToProductModal
            open={linkModalOpen}
            onClose={() => setLinkModalOpen(false)}
            canonicalIngredientId={canonicalIngredientId ?? undefined}
            ingredientName={name}
          />
        </div>

        <IngredientEditForm
          source="nevo"
          id={id}
          initialData={item}
          showEnrich={true}
        />
      </div>
    </div>
  );
}
