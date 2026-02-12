'use client';

import { useState } from 'react';
import { Button } from '@/components/catalyst/button';
import { LinkIngredientToProductModal } from '@/src/app/(app)/admin/ingredient-product-links/components/LinkIngredientToProductModal';
import { LinkIcon } from '@heroicons/react/20/solid';

type LinkIngredientToProductSectionProps = {
  ingredientName: string;
  canonicalIngredientId?: string | null;
};

export function LinkIngredientToProductSection({
  ingredientName,
  canonicalIngredientId,
}: LinkIngredientToProductSectionProps) {
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  return (
    <div className="mb-6 rounded-lg bg-muted/20 p-4">
      <p className="mb-2 text-sm text-muted-foreground">
        Koppel dit ingrediënt aan een winkelproduct voor de boodschappenlijst.
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
        ingredientName={ingredientName}
      />
    </div>
  );
}
