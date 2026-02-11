'use client';

import { useState } from 'react';
import { Button } from '@/components/catalyst/button';
import { LinkProductToIngredientModal } from './LinkProductToIngredientModal';

type ProductLinkToIngredientCellProps = {
  storeId: string;
  storeProductId: string;
  productTitle?: string;
};

export function ProductLinkToIngredientCell({
  storeId,
  storeProductId,
  productTitle,
}: ProductLinkToIngredientCellProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        plain
        onClick={() => setOpen(true)}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Koppel aan ingrediënt
      </Button>
      <LinkProductToIngredientModal
        open={open}
        onClose={() => setOpen(false)}
        storeId={storeId}
        storeProductId={storeProductId}
        productTitle={productTitle}
      />
    </>
  );
}
