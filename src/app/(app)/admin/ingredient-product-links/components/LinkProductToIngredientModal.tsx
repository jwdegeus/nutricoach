'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Text } from '@/components/catalyst/text';
import {
  getStoreProductByIdAction,
  searchCanonicalIngredientsAction,
  upsertStoreProductLinkAction,
} from '@/src/app/(app)/meal-plans/actions/storeProductLinks.actions';
import type { StoreProductDisplay } from '@/src/lib/shopping/storeProductLinks.types';
import type { CanonicalIngredient } from '@/src/lib/ingredients/canonicalIngredients.types';
import { useToast } from '@/src/components/app/ToastContext';
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid';

type LinkProductToIngredientModalProps = {
  open: boolean;
  onClose: () => void;
  storeId: string;
  storeProductId: string;
  productTitle?: string;
  onSuccess?: () => void;
};

export function LinkProductToIngredientModal({
  open,
  onClose,
  storeId,
  storeProductId,
  productTitle: productTitleProp,
  onSuccess,
}: LinkProductToIngredientModalProps) {
  const { showToast } = useToast();
  const [product, setProduct] = useState<StoreProductDisplay | null>(null);
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [ingredientSearchLoading, setIngredientSearchLoading] = useState(false);
  const [ingredientResults, setIngredientResults] = useState<
    CanonicalIngredient[]
  >([]);
  const [selectedCanonicalIngredientId, setSelectedCanonicalIngredientId] =
    useState<string | null>(null);
  const [upsertLoading, setUpsertLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !storeProductId) return;
    setProduct(null);
    setSelectedCanonicalIngredientId(null);
    setIngredientQuery('');
    setIngredientResults([]);
    setError(null);
    if (productTitleProp) {
      setProduct({
        id: storeProductId,
        title: productTitleProp,
        brand: null,
        productUrl: null,
        priceCents: null,
        gtin: null,
        categoryPath: null,
        isActive: true,
      });
    } else {
      getStoreProductByIdAction(storeProductId).then((res) => {
        if (res.ok && res.data) setProduct(res.data);
      });
    }
  }, [open, storeProductId, productTitleProp]);

  const runIngredientSearch = useCallback(async () => {
    const q = ingredientQuery.trim();
    if (!q) {
      setIngredientResults([]);
      return;
    }
    setError(null);
    setIngredientSearchLoading(true);
    const res = await searchCanonicalIngredientsAction({ q, limit: 25 });
    setIngredientSearchLoading(false);
    if (res.ok) setIngredientResults(res.data);
    else setError(res.error.message);
  }, [ingredientQuery]);

  const handleLink = async () => {
    if (!selectedCanonicalIngredientId) return;
    setError(null);
    setUpsertLoading(true);
    const res = await upsertStoreProductLinkAction({
      canonicalIngredientId: selectedCanonicalIngredientId,
      storeId,
      storeProductId,
    });
    setUpsertLoading(false);
    if (res.ok && res.data) {
      showToast({ type: 'success', title: 'Koppeling opgeslagen' });
      onSuccess?.();
      onClose();
    } else {
      setError(res.ok ? 'Onbekende fout' : res.error!.message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>Koppel product aan ingrediënt</DialogTitle>
      <DialogBody>
        {product && (
          <div className="rounded-lg bg-muted/20 px-4 py-2 mb-4">
            <Text className="font-medium">{product.title}</Text>
            {product.brand && (
              <Text className="text-sm text-muted-foreground">
                {product.brand}
              </Text>
            )}
          </div>
        )}
        {error && (
          <div
            className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-800 dark:text-red-200 mb-4"
            role="alert"
          >
            {error}
          </div>
        )}
        <div className="space-y-3">
          <Text className="text-sm text-muted-foreground">
            Zoek en selecteer het canonieke ingrediënt waaraan dit product
            gekoppeld moet worden.
          </Text>
          <div className="flex gap-2">
            <Input
              type="search"
              placeholder="Naam of slug..."
              value={ingredientQuery}
              onChange={(e) => setIngredientQuery(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' && (e.preventDefault(), runIngredientSearch())
              }
              className="flex-1"
            />
            <Button
              onClick={runIngredientSearch}
              disabled={ingredientSearchLoading}
            >
              {ingredientSearchLoading ? (
                <span className="animate-pulse">Zoeken...</span>
              ) : (
                <>
                  <MagnifyingGlassIcon className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
          {ingredientResults.length > 0 && (
            <ul className="rounded-lg bg-muted/20 divide-y divide-white/10 max-h-48 overflow-y-auto">
              {ingredientResults.map((ing) => (
                <li key={ing.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCanonicalIngredientId(ing.id)}
                    className={`w-full text-left px-4 py-2 hover:bg-muted/40 transition-colors ${
                      selectedCanonicalIngredientId === ing.id
                        ? 'bg-muted/40'
                        : ''
                    }`}
                  >
                    <span className="font-medium">{ing.name}</span>
                    <span className="text-muted-foreground text-sm ml-2">
                      ({ing.slug})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Annuleren
        </Button>
        <Button
          onClick={handleLink}
          disabled={!selectedCanonicalIngredientId || upsertLoading}
        >
          {upsertLoading ? 'Bezig...' : 'Koppel aan dit product'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
