'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Text } from '@/components/catalyst/text';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Select } from '@/components/catalyst/select';
import {
  getStoresForShoppingAction,
  searchStoreProductsAction,
  searchCanonicalIngredientsAction,
  searchAhProductsAction,
  upsertStoreProductLinkAction,
} from '@/src/app/(app)/meal-plans/actions/storeProductLinks.actions';
import type { StoreProductDisplay } from '@/src/lib/shopping/storeProductLinks.types';
import type { CanonicalIngredient } from '@/src/lib/ingredients/canonicalIngredients.types';
import { useToast } from '@/src/components/app/ToastContext';
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

type Store = { id: string; name: string };

type LinkIngredientToProductModalProps = {
  open: boolean;
  onClose: () => void;
  /** Als null/undefined: eerst canoniek ingrediënt zoeken in de modal. */
  canonicalIngredientId?: string | null;
  ingredientName: string;
  onSuccess?: () => void;
};

export function LinkIngredientToProductModal({
  open,
  onClose,
  canonicalIngredientId: initialCanonicalIngredientId,
  ingredientName,
  onSuccess,
}: LinkIngredientToProductModalProps) {
  const { showToast } = useToast();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productResults, setProductResults] = useState<StoreProductDisplay[]>(
    [],
  );
  const [ahResults, setAhResults] = useState<
    { name: string; brand: string; productUrl: string | null }[]
  >([]);
  const [ahSearchLoading, setAhSearchLoading] = useState(false);
  const [upsertLoading, setUpsertLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ingredientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const productDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ahDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Wanneer er geen initial canonical is: stap 1 = zoek en kies canoniek ingrediënt. */
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [ingredientSearchLoading, setIngredientSearchLoading] = useState(false);
  const [ingredientResults, setIngredientResults] = useState<
    CanonicalIngredient[]
  >([]);
  const [selectedCanonicalIngredientId, setSelectedCanonicalIngredientId] =
    useState<string | null>(initialCanonicalIngredientId ?? null);
  const [selectedIngredientName, setSelectedIngredientName] = useState<
    string | null
  >(initialCanonicalIngredientId ? ingredientName : null);

  const needsIngredientStep =
    initialCanonicalIngredientId == null || initialCanonicalIngredientId === '';
  const canonicalId =
    selectedCanonicalIngredientId ?? initialCanonicalIngredientId ?? null;
  const displayName = selectedIngredientName ?? ingredientName;

  useEffect(() => {
    if (!open) return;
    setStores([]);
    setSelectedStoreId('');
    setProductQuery('');
    setProductResults([]);
    setAhResults([]);
    setError(null);
    setSelectedCanonicalIngredientId(initialCanonicalIngredientId ?? null);
    setSelectedIngredientName(
      initialCanonicalIngredientId ? ingredientName : null,
    );
    setIngredientQuery('');
    setIngredientResults([]);
    getStoresForShoppingAction().then((res) => {
      if (res.ok && res.data) setStores(res.data);
    });
  }, [open, initialCanonicalIngredientId, ingredientName]);

  const runIngredientSearch = useCallback(async () => {
    const q = ingredientQuery.trim();
    if (q.length < MIN_CHARS) {
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

  const runProductSearch = useCallback(async () => {
    const q = productQuery.trim();
    if (!selectedStoreId || q.length < MIN_CHARS) {
      setProductResults([]);
      return;
    }
    setError(null);
    setProductSearchLoading(true);
    const res = await searchStoreProductsAction({
      storeId: selectedStoreId,
      q,
      limit: 25,
    });
    setProductSearchLoading(false);
    if (res.ok) setProductResults(res.data);
    else setError(res.error.message);
  }, [selectedStoreId, productQuery]);

  const runAhSearch = useCallback(async () => {
    const q = productQuery.trim();
    if (q.length < MIN_CHARS) {
      setAhResults([]);
      return;
    }
    setAhSearchLoading(true);
    const res = await searchAhProductsAction(q, 10);
    setAhSearchLoading(false);
    if (res.ok) setAhResults(res.data);
    else setAhResults([]);
  }, [productQuery]);

  useEffect(() => {
    if (!open || !needsIngredientStep) return;
    if (ingredientDebounceRef.current)
      clearTimeout(ingredientDebounceRef.current);
    if (ingredientQuery.trim().length < MIN_CHARS) {
      setIngredientResults([]);
      return;
    }
    ingredientDebounceRef.current = setTimeout(() => {
      runIngredientSearch();
      ingredientDebounceRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (ingredientDebounceRef.current)
        clearTimeout(ingredientDebounceRef.current);
    };
  }, [ingredientQuery, open, needsIngredientStep, runIngredientSearch]);

  useEffect(() => {
    if (!open || !selectedStoreId) return;
    if (productDebounceRef.current) clearTimeout(productDebounceRef.current);
    if (productQuery.trim().length < MIN_CHARS) {
      setProductResults([]);
      return;
    }
    productDebounceRef.current = setTimeout(() => {
      runProductSearch();
      productDebounceRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (productDebounceRef.current) clearTimeout(productDebounceRef.current);
    };
  }, [productQuery, selectedStoreId, open, runProductSearch]);

  useEffect(() => {
    if (!open) return;
    if (ahDebounceRef.current) clearTimeout(ahDebounceRef.current);
    if (productQuery.trim().length < MIN_CHARS) {
      setAhResults([]);
      return;
    }
    ahDebounceRef.current = setTimeout(() => {
      runAhSearch();
      ahDebounceRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (ahDebounceRef.current) clearTimeout(ahDebounceRef.current);
    };
  }, [productQuery, open, runAhSearch]);

  const handleChooseProduct = async (product: StoreProductDisplay) => {
    if (!selectedStoreId || !canonicalId) return;
    setError(null);
    setUpsertLoading(true);
    const res = await upsertStoreProductLinkAction({
      canonicalIngredientId: canonicalId,
      storeId: selectedStoreId,
      storeProductId: product.id,
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
      <DialogTitle>Koppel ingrediënt aan winkelproduct</DialogTitle>
      <DialogBody>
        {needsIngredientStep && !canonicalId ? (
          <>
            <Text className="mb-2 text-sm text-muted-foreground">
              Dit NEVO-ingrediënt heeft nog geen canonieke koppeling. Zoek het
              bijpassende canonieke ingrediënt (bijv. &quot;{ingredientName}
              &quot;); suggesties verschijnen na {MIN_CHARS} tekens.
            </Text>
            <div className="mb-3 flex gap-2">
              <Input
                type="search"
                placeholder="Zoek canoniek ingrediënt op naam (min. 3 tekens)..."
                value={ingredientQuery}
                onChange={(e) => setIngredientQuery(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  (e.preventDefault(), runIngredientSearch())
                }
                className="flex-1"
              />
              <Button
                onClick={runIngredientSearch}
                disabled={ingredientSearchLoading}
              >
                {ingredientSearchLoading ? (
                  'Zoeken...'
                ) : (
                  <MagnifyingGlassIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
            {ingredientQuery.trim().length > 0 &&
              ingredientQuery.trim().length < MIN_CHARS && (
                <p className="mb-2 text-sm text-muted-foreground">
                  Typ nog {MIN_CHARS - ingredientQuery.trim().length} teken(s)
                  voor suggesties.
                </p>
              )}
            {ingredientResults.length > 0 && (
              <ul className="max-h-40 divide-y divide-white/10 overflow-y-auto rounded-lg bg-muted/20">
                {ingredientResults.map((ing) => (
                  <li key={ing.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCanonicalIngredientId(ing.id);
                        setSelectedIngredientName(ing.name);
                      }}
                      className={`w-full px-4 py-2 text-left transition-colors hover:bg-muted/40 ${
                        selectedCanonicalIngredientId === ing.id
                          ? 'bg-muted/40'
                          : ''
                      }`}
                    >
                      <span className="font-medium">{ing.name}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        ({ing.slug})
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="mb-4 rounded-lg bg-muted/20 px-4 py-2">
              <Text className="font-medium">{displayName}</Text>
            </div>
            <div className="space-y-4">
              <Field>
                <Label>Winkel</Label>
                <Select
                  value={selectedStoreId}
                  onChange={(e) => {
                    setSelectedStoreId(e.target.value);
                    setProductResults([]);
                  }}
                  className="mt-1"
                >
                  <option value="">Kies een winkel</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {selectedStoreId && (
                <>
                  <div className="flex gap-2">
                    <Input
                      type="search"
                      placeholder="Zoek product (min. 3 tekens): eerst geïmporteerde artikelen, daarna AH..."
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        (e.preventDefault(), runProductSearch())
                      }
                      className="flex-1"
                    />
                    <Button
                      onClick={runProductSearch}
                      disabled={productSearchLoading}
                    >
                      {productSearchLoading ? (
                        <span className="animate-pulse">Zoeken...</span>
                      ) : (
                        <MagnifyingGlassIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {productQuery.trim().length > 0 &&
                    productQuery.trim().length < MIN_CHARS && (
                      <p className="text-sm text-muted-foreground">
                        Typ nog {MIN_CHARS - productQuery.trim().length}{' '}
                        teken(s) voor suggesties.
                      </p>
                    )}
                  {productResults.length > 0 && (
                    <>
                      <Text className="mt-2 text-sm font-medium text-foreground">
                        Geïmporteerde artikelen (koppelen mogelijk)
                      </Text>
                      <ul className="mt-1 max-h-48 divide-y divide-white/10 overflow-y-auto rounded-lg bg-muted/20">
                        {productResults.map((product) => (
                          <li
                            key={product.id}
                            className="flex items-center justify-between gap-4 px-4 py-2"
                          >
                            <div>
                              <Text className="font-medium">
                                {product.title}
                              </Text>
                              {product.brand && (
                                <Text className="text-sm text-muted-foreground">
                                  {product.brand}
                                </Text>
                              )}
                              {product.priceCents != null && (
                                <Text className="text-sm">
                                  €{(product.priceCents / 100).toFixed(2)}
                                </Text>
                              )}
                            </div>
                            <Button
                              onClick={() => handleChooseProduct(product)}
                              disabled={upsertLoading}
                            >
                              {upsertLoading ? 'Bezig...' : 'Kies'}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {(ahResults.length > 0 || ahSearchLoading) && (
                    <>
                      <Text className="mt-3 text-sm font-medium text-foreground">
                        Albert Heijn (alleen referentie, koppelen via
                        geïmporteerde winkel)
                      </Text>
                      {ahSearchLoading ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Zoeken...
                        </p>
                      ) : (
                        <ul className="mt-1 max-h-36 divide-y divide-white/10 overflow-y-auto rounded-lg bg-muted/20">
                          {ahResults.map((p, i) => (
                            <li
                              key={`ah-${i}`}
                              className="flex items-center justify-between gap-4 px-4 py-2"
                            >
                              <div>
                                <Text className="font-medium">{p.name}</Text>
                                {p.brand && (
                                  <Text className="text-sm text-muted-foreground">
                                    {p.brand}
                                  </Text>
                                )}
                              </div>
                              {p.productUrl && (
                                <a
                                  href={p.productUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-muted-foreground hover:text-foreground"
                                >
                                  Bekijk op ah.nl
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
        {error && (
          <div
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-200"
            role="alert"
          >
            {error}
          </div>
        )}
      </DialogBody>
      <DialogActions>
        {needsIngredientStep && canonicalId && (
          <Button
            plain
            onClick={() => {
              setSelectedCanonicalIngredientId(null);
              setSelectedIngredientName(null);
            }}
          >
            Ander ingrediënt
          </Button>
        )}
        <Button plain onClick={onClose}>
          Sluiten
        </Button>
      </DialogActions>
    </Dialog>
  );
}
