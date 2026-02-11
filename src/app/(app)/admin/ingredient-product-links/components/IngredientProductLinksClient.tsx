'use client';

import { useState, useCallback, useEffect } from 'react';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Select } from '@/components/catalyst/select';
import {
  searchCanonicalIngredientsAction,
  getCanonicalIngredientByIdAction,
  getStoreProductByIdAction,
  getStoreProductLinkAction,
  searchStoreProductsAction,
  upsertStoreProductLinkAction,
  deleteStoreProductLinkAction,
  runAutoMatchAction,
} from '@/src/app/(app)/meal-plans/actions/storeProductLinks.actions';
import type {
  StoreProductLinkResult,
  StoreProductDisplay,
} from '@/src/lib/shopping/storeProductLinks.types';
import type { CanonicalIngredient } from '@/src/lib/ingredients/canonicalIngredients.types';
import { useToast } from '@/src/components/app/ToastContext';
import {
  MagnifyingGlassIcon,
  TrashIcon,
  SparklesIcon,
} from '@heroicons/react/16/solid';

type Store = { id: string; name: string };

type IngredientProductLinksClientProps = {
  stores: Store[];
  initialCanonicalIngredientId?: string;
  initialStoreId?: string;
  initialStoreProductId?: string;
};

export function IngredientProductLinksClient({
  stores,
  initialCanonicalIngredientId,
  initialStoreId,
  initialStoreProductId,
}: IngredientProductLinksClientProps) {
  const { showToast } = useToast();
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [ingredientSearchLoading, setIngredientSearchLoading] = useState(false);
  const [ingredientResults, setIngredientResults] = useState<
    CanonicalIngredient[]
  >([]);
  const [selectedCanonicalIngredientId, setSelectedCanonicalIngredientId] =
    useState<string | null>(initialCanonicalIngredientId ?? null);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    initialStoreId ?? '',
  );
  const [selectedIngredientName, setSelectedIngredientName] = useState<
    string | null
  >(null);
  /** Product-first flow: wanneer we vanaf winkelpagina komen met storeId + storeProductId */
  const [productToLink, setProductToLink] = useState<{
    product: StoreProductDisplay;
    storeId: string;
  } | null>(null);
  const [currentLink, setCurrentLink] = useState<
    StoreProductLinkResult | null | undefined
  >(undefined);
  const [currentLinkLoading, setCurrentLinkLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productResults, setProductResults] = useState<StoreProductDisplay[]>(
    [],
  );
  const [upsertLoading, setUpsertLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoMatchLoading, setAutoMatchLoading] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState<{
    created: number;
    skipped: number;
  } | null>(null);

  const canEditLink = Boolean(selectedCanonicalIngredientId && selectedStoreId);

  const handleAutoMatch = async () => {
    setAutoMatchLoading(true);
    setAutoMatchResult(null);
    setError(null);
    const res = await runAutoMatchAction();
    setAutoMatchLoading(false);
    if (res.ok && res.data) {
      setAutoMatchResult(res.data);
      showToast({
        type: 'success',
        title: 'Auto-match voltooid',
        description: `${res.data.created} koppeling(en) toegevoegd, ${res.data.skipped} al aanwezig of overgeslagen.`,
      });
    } else {
      setError(res.ok ? 'Onbekende fout' : res.error!.message);
    }
  };

  // Pre-select vanuit URL (ingredient- of winkelpagina)
  useEffect(() => {
    if (initialCanonicalIngredientId) {
      setSelectedCanonicalIngredientId(initialCanonicalIngredientId);
      getCanonicalIngredientByIdAction(initialCanonicalIngredientId).then(
        (res) => {
          if (res.ok && res.data) setSelectedIngredientName(res.data.name);
        },
      );
    }
  }, [initialCanonicalIngredientId]);
  useEffect(() => {
    if (initialStoreId) setSelectedStoreId(initialStoreId);
  }, [initialStoreId]);
  useEffect(() => {
    if (initialStoreProductId && initialStoreId) {
      getStoreProductByIdAction(initialStoreProductId).then((res) => {
        if (res.ok && res.data)
          setProductToLink({ product: res.data, storeId: initialStoreId });
      });
    }
  }, [initialStoreProductId, initialStoreId]);

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

  const loadCurrentLink = useCallback(async () => {
    if (!selectedCanonicalIngredientId || !selectedStoreId) return;
    setError(null);
    setCurrentLinkLoading(true);
    const res = await getStoreProductLinkAction({
      canonicalIngredientId: selectedCanonicalIngredientId,
      storeId: selectedStoreId,
    });
    setCurrentLinkLoading(false);
    if (res.ok) setCurrentLink(res.data);
    else setCurrentLink(null);
  }, [selectedCanonicalIngredientId, selectedStoreId]);

  useEffect(() => {
    if (selectedCanonicalIngredientId && selectedStoreId) {
      setCurrentLink(undefined);
      loadCurrentLink();
    } else {
      setCurrentLink(undefined);
    }
  }, [selectedCanonicalIngredientId, selectedStoreId, loadCurrentLink]);

  const handleIngredientSelect = (id: string) => {
    setSelectedCanonicalIngredientId(id);
  };

  const handleStoreChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStoreId(e.target.value);
  };

  const runProductSearch = useCallback(async () => {
    const q = productQuery.trim();
    if (!selectedStoreId || !q) {
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

  const handleChooseProduct = async (product: StoreProductDisplay) => {
    if (!selectedCanonicalIngredientId || !selectedStoreId) return;
    setError(null);
    setUpsertLoading(true);
    const res = await upsertStoreProductLinkAction({
      canonicalIngredientId: selectedCanonicalIngredientId,
      storeId: selectedStoreId,
      storeProductId: product.id,
    });
    setUpsertLoading(false);
    if (res.ok && res.data) {
      setCurrentLink(res.data);
      showToast({ type: 'success', title: 'Koppeling opgeslagen' });
    } else {
      setError(res.ok ? 'Onbekende fout' : res.error!.message);
    }
  };

  const handleDeleteLink = async () => {
    if (!selectedCanonicalIngredientId || !selectedStoreId) return;
    setError(null);
    setDeleteLoading(true);
    const res = await deleteStoreProductLinkAction({
      canonicalIngredientId: selectedCanonicalIngredientId,
      storeId: selectedStoreId,
    });
    setDeleteLoading(false);
    if (res.ok && res.data) {
      setCurrentLink(null);
      showToast({ type: 'success', title: 'Koppeling verwijderd' });
    } else {
      setError(res.ok ? 'Onbekende fout' : res.error!.message);
    }
  };

  const handleLinkProductToIngredient = async () => {
    if (!productToLink || !selectedCanonicalIngredientId) return;
    setError(null);
    setUpsertLoading(true);
    const res = await upsertStoreProductLinkAction({
      canonicalIngredientId: selectedCanonicalIngredientId,
      storeId: productToLink.storeId,
      storeProductId: productToLink.product.id,
    });
    setUpsertLoading(false);
    if (res.ok && res.data) {
      setCurrentLink(res.data);
      setProductToLink(null);
      showToast({ type: 'success', title: 'Koppeling opgeslagen' });
    } else {
      setError(res.ok ? 'Onbekende fout' : res.error!.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Heading level={1}>Ingrediënt ↔ Product koppelingen</Heading>
        <Text className="mt-2 text-muted-foreground">
          Zoek een canoniek ingrediënt, kies een winkel en koppel een
          voorkeursproduct. Deze koppelingen worden gebruikt op de
          boodschappenlijst.
        </Text>
      </div>

      <section className="rounded-lg bg-muted/20 p-4">
        <Heading level={2} className="text-lg">
          Auto-match op naam
        </Heading>
        <Text className="mt-1 text-sm text-muted-foreground">
          Maak automatisch koppelingen waar de ingrediëntnaam en producttitel
          hetzelfde zijn (hoofdletterongevoelig). Eén ingrediënt kan meerdere
          producten krijgen (per winkel).
        </Text>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={handleAutoMatch} disabled={autoMatchLoading}>
            {autoMatchLoading ? (
              <span className="animate-pulse">Bezig...</span>
            ) : (
              <>
                <SparklesIcon className="h-4 w-4 mr-2" />
                Auto-match uitvoeren
              </>
            )}
          </Button>
          {autoMatchResult && (
            <span className="text-sm text-muted-foreground">
              {autoMatchResult.created} toegevoegd, {autoMatchResult.skipped}{' '}
              overgeslagen
            </span>
          )}
        </div>
      </section>

      {error && (
        <div
          className="rounded-lg bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-800 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      {productToLink && (
        <section className="rounded-lg bg-muted/20 p-4 space-y-3">
          <Heading level={2} className="text-lg">
            Koppel dit product aan een ingrediënt
          </Heading>
          <div className="flex flex-wrap items-center gap-3">
            <Text className="font-medium">{productToLink.product.title}</Text>
            {productToLink.product.brand && (
              <Text className="text-sm text-muted-foreground">
                ({productToLink.product.brand})
              </Text>
            )}
            {selectedCanonicalIngredientId && (
              <Button
                onClick={handleLinkProductToIngredient}
                disabled={upsertLoading}
              >
                {upsertLoading ? 'Bezig...' : 'Koppel aan dit product'}
              </Button>
            )}
          </div>
          {!selectedCanonicalIngredientId && (
            <Text className="text-sm text-muted-foreground">
              Zoek en selecteer hieronder een ingrediënt, daarna verschijnt de
              knop om te koppelen.
            </Text>
          )}
        </section>
      )}

      {selectedIngredientName &&
        selectedCanonicalIngredientId &&
        !productToLink && (
          <div className="rounded-lg bg-muted/20 px-4 py-2">
            <Text className="text-sm text-muted-foreground">
              Geselecteerd ingrediënt:{' '}
              <span className="font-medium text-foreground">
                {selectedIngredientName}
              </span>
            </Text>
          </div>
        )}

      <section className="space-y-4">
        <Heading level={2} className="text-lg">
          1. Zoek ingrediënt
        </Heading>
        <div className="flex gap-2">
          <Input
            type="search"
            placeholder="Naam of slug..."
            value={ingredientQuery}
            onChange={(e) => setIngredientQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runIngredientSearch()}
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
                <MagnifyingGlassIcon className="h-4 w-4 mr-1" />
                Zoeken
              </>
            )}
          </Button>
        </div>
        {ingredientQuery.trim() === '' &&
          ingredientResults.length === 0 &&
          !ingredientSearchLoading && (
            <Text className="text-sm text-muted-foreground">
              Typ om te zoeken
            </Text>
          )}
        {ingredientQuery.trim() !== '' &&
          ingredientResults.length === 0 &&
          !ingredientSearchLoading && (
            <Text className="text-sm text-muted-foreground">
              Geen resultaten
            </Text>
          )}
        {ingredientResults.length > 0 && (
          <ul className="rounded-lg bg-muted/20 divide-y divide-white/10 max-h-60 overflow-y-auto">
            {ingredientResults.map((ing) => (
              <li key={ing.id}>
                <button
                  type="button"
                  onClick={() => handleIngredientSelect(ing.id)}
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
      </section>

      <section className="space-y-4">
        <Heading level={2} className="text-lg">
          2. Kies winkel
        </Heading>
        <Field>
          <Label>Winkel</Label>
          <Select
            value={selectedStoreId}
            onChange={handleStoreChange}
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
      </section>

      {canEditLink && (
        <section className="space-y-4">
          <Heading level={2} className="text-lg">
            3. Huidige koppeling
          </Heading>
          {currentLinkLoading ? (
            <Text className="text-sm text-muted-foreground">Laden...</Text>
          ) : currentLink ? (
            <div className="rounded-lg bg-muted/20 p-4 flex items-start justify-between gap-4">
              <div>
                <Text className="font-medium">
                  {currentLink.storeProduct.title}
                </Text>
                {currentLink.storeProduct.brand && (
                  <Text className="text-sm text-muted-foreground">
                    {currentLink.storeProduct.brand}
                  </Text>
                )}
                {currentLink.storeProduct.priceCents != null && (
                  <Text className="text-sm mt-1">
                    €{(currentLink.storeProduct.priceCents / 100).toFixed(2)}
                  </Text>
                )}
              </div>
              <Button
                onClick={handleDeleteLink}
                disabled={deleteLoading}
                color="red"
              >
                {deleteLoading ? (
                  <span className="animate-pulse">Bezig...</span>
                ) : (
                  <>
                    <TrashIcon className="h-4 w-4 mr-1" />
                    Verwijder
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Text className="text-sm text-muted-foreground">
              Geen product gekoppeld voor deze winkel.
            </Text>
          )}
        </section>
      )}

      {canEditLink && (
        <section className="space-y-4">
          <Heading level={2} className="text-lg">
            4. Zoek en kies product
          </Heading>
          <div className="flex gap-2">
            <Input
              type="search"
              placeholder="Zoek product in winkel..."
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runProductSearch()}
              className="flex-1"
            />
            <Button onClick={runProductSearch} disabled={productSearchLoading}>
              {productSearchLoading ? (
                <span className="animate-pulse">Zoeken...</span>
              ) : (
                <>
                  <MagnifyingGlassIcon className="h-4 w-4 mr-1" />
                  Zoeken
                </>
              )}
            </Button>
          </div>
          {productQuery.trim() === '' &&
            productResults.length === 0 &&
            !productSearchLoading && (
              <Text className="text-sm text-muted-foreground">
                Typ om te zoeken
              </Text>
            )}
          {productQuery.trim() !== '' &&
            productResults.length === 0 &&
            !productSearchLoading && (
              <Text className="text-sm text-muted-foreground">
                Geen resultaten
              </Text>
            )}
          {productResults.length > 0 && (
            <ul className="rounded-lg bg-muted/20 divide-y divide-white/10 max-h-60 overflow-y-auto">
              {productResults.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between gap-4 px-4 py-2"
                >
                  <div>
                    <Text className="font-medium">{product.title}</Text>
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
          )}
        </section>
      )}
    </div>
  );
}
