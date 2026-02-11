'use client';

import { useState, useEffect, useCallback } from 'react';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Input } from '@/components/catalyst/input';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogActions,
} from '@/components/catalyst/dialog';
import {
  PlusIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ShoppingBagIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
} from '@heroicons/react/16/solid';
import { useRouter } from 'next/navigation';
import {
  upsertUserPantryItemAction,
  bulkUpsertUserPantryItemsAction,
} from '@/src/app/(app)/pantry/actions/pantry-ui.actions';
import {
  getStoreProductLinksForStoreAction,
  searchStoreProductsAction,
  upsertStoreProductLinkAction,
} from '@/src/app/(app)/meal-plans/actions/storeProductLinks.actions';
import type {
  StoreProductLinkResult,
  StoreProductDisplay,
} from '@/src/lib/shopping/storeProductLinks.types';
import type {
  ShoppingListResponse,
  MealPlanCoverage,
} from '@/src/lib/agents/meal-planner';

type StoreForShopping = { id: string; name: string };

type ShoppingListViewProps = {
  shoppingList: ShoppingListResponse;
  coverage: MealPlanCoverage;
  pantryMap: Record<string, { availableG?: number; isAvailable?: boolean }>;
  stores?: StoreForShopping[];
};

export function ShoppingListView({
  shoppingList,
  coverage,
  pantryMap,
  stores = [],
}: ShoppingListViewProps) {
  const router = useRouter();
  const primaryStore = stores[0] ?? null;

  const [addingItems, setAddingItems] = useState<Set<string>>(new Set());
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  // Store product link per (canonicalIngredientId, storeId)
  const [linkByKey, setLinkByKey] = useState<
    Record<string, StoreProductLinkResult | null>
  >({});
  // Modal: which item is being edited
  const [modalItem, setModalItem] = useState<{
    canonicalIngredientId: string;
    nevoCode: string;
    name: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StoreProductDisplay[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [upserting, setUpserting] = useState(false);

  // Get all items that need to be purchased
  const allItemsToBuy = shoppingList.groups.flatMap((group) =>
    group.items.filter((item) => item.missingG > 0),
  );

  const handleAddToPantry = async (nevoCode: string, missingG: number) => {
    setAddingItems((prev) => new Set(prev).add(nevoCode));

    try {
      const result = await upsertUserPantryItemAction({
        nevoCode,
        isAvailable: true,
        availableG: missingG,
      });

      if (result.ok) {
        // Dispatch custom event to notify shopping cart
        window.dispatchEvent(new CustomEvent('meal-plan-changed'));
        router.refresh();
      }
    } catch (error) {
      console.error('Error adding item to pantry:', error);
    } finally {
      setAddingItems((prev) => {
        const next = new Set(prev);
        next.delete(nevoCode);
        return next;
      });
    }
  };

  const handleToggleItem = (nevoCode: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(nevoCode)) {
        next.delete(nevoCode);
      } else {
        next.add(nevoCode);
      }
      return next;
    });
  };

  const handleBulkAddChecked = async () => {
    if (checkedItems.size === 0) return;

    setIsBulkAdding(true);
    try {
      const items = Array.from(checkedItems).map((nevoCode) => {
        const item = allItemsToBuy.find((i) => i.nevoCode === nevoCode);
        return {
          nevoCode,
          isAvailable: true,
          availableG: item?.missingG || null,
        };
      });

      const result = await bulkUpsertUserPantryItemsAction({ items });
      if (result.ok) {
        // Dispatch custom event to notify shopping cart
        window.dispatchEvent(new CustomEvent('meal-plan-changed'));
        setCheckedItems(new Set());
        router.refresh();
      }
    } catch (error) {
      console.error('Error bulk adding items:', error);
    } finally {
      setIsBulkAdding(false);
    }
  };

  const getPantryInfo = (nevoCode: string) => {
    const pantry = pantryMap[nevoCode];
    if (!pantry) {
      return null;
    }

    if (pantry.availableG !== undefined) {
      return { type: 'quantity' as const, value: pantry.availableG };
    }

    if (pantry.isAvailable === true) {
      return { type: 'binary' as const, value: null };
    }

    return null;
  };

  const linkKey = useCallback(
    (canonicalIngredientId: string, storeId: string) =>
      `${canonicalIngredientId}-${storeId}`,
    [],
  );

  // Batch-load store product links for all items with canonicalIngredientId (primary store only)
  useEffect(() => {
    if (!primaryStore) return;
    const canonicalIds = [
      ...new Set(
        shoppingList.groups.flatMap((g) =>
          g.items
            .filter((i) => i.canonicalIngredientId && i.missingG > 0)
            .map((i) => i.canonicalIngredientId!),
        ),
      ),
    ];
    if (canonicalIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const res = await getStoreProductLinksForStoreAction({
        storeId: primaryStore.id,
        canonicalIngredientIds: canonicalIds,
      });
      if (cancelled) return;
      if (!res.ok) {
        return; // Log is server-side; no per-item callout
      }
      const next: Record<string, StoreProductLinkResult | null> = {};
      for (const link of res.data) {
        next[linkKey(link.canonicalIngredientId, primaryStore.id)] = link;
      }
      setLinkByKey((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [primaryStore?.id, shoppingList.groups, linkKey]);

  const openChooseProductModal = (item: {
    canonicalIngredientId: string;
    nevoCode: string;
    name: string;
  }) => {
    setModalItem(item);
    setSearchQuery('');
    setSearchResults([]);
    setModalError(null);
  };

  const closeModal = () => {
    setModalItem(null);
    setSearchQuery('');
    setSearchResults([]);
    setModalError(null);
  };

  const runSearch = useCallback(async () => {
    if (!primaryStore || !modalItem) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setModalError(null);
    const res = await searchStoreProductsAction({
      storeId: primaryStore.id,
      q,
      limit: 20,
    });
    setSearchLoading(false);
    if (res.ok) setSearchResults(res.data);
    else setModalError(res.error.message);
  }, [primaryStore, modalItem, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch();
  };

  const handleSelectProduct = async (product: StoreProductDisplay) => {
    if (!primaryStore || !modalItem) return;
    setUpserting(true);
    setModalError(null);
    const res = await upsertStoreProductLinkAction({
      canonicalIngredientId: modalItem.canonicalIngredientId,
      storeId: primaryStore.id,
      storeProductId: product.id,
    });
    setUpserting(false);
    if (res.ok && res.data) {
      const key = linkKey(modalItem.canonicalIngredientId, primaryStore.id);
      setLinkByKey((prev) => ({ ...prev, [key]: res.data! }));
      closeModal();
      router.refresh();
    } else {
      setModalError(res.ok ? 'Onbekende fout' : res.error.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              Items te kopen
            </Text>
            <div className="mt-0.5 text-lg font-semibold text-zinc-950 dark:text-white">
              {allItemsToBuy.length}
            </div>
          </div>
          <div>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              Totaal gewicht
            </Text>
            <div className="mt-0.5 text-lg font-semibold text-red-600 dark:text-red-400">
              {shoppingList.totals.missingG.toFixed(0)}g
            </div>
          </div>
          <div>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              Coverage
            </Text>
            <div className="mt-0.5 text-lg font-semibold text-zinc-950 dark:text-white">
              {coverage.totals.coveragePct.toFixed(0)}%
            </div>
          </div>
        </div>

        {checkedItems.size > 0 && (
          <Button
            onClick={handleBulkAddChecked}
            disabled={isBulkAdding}
            color="green"
          >
            {isBulkAdding ? (
              <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircleIcon className="mr-2 h-4 w-4" />
            )}
            Markeer {checkedItems.size} item{checkedItems.size > 1 ? 's' : ''}{' '}
            als gekocht
          </Button>
        )}
      </div>

      {/* Shopping List Groups - Organized by category */}
      <div className="space-y-3">
        {shoppingList.groups.map((group) => {
          const itemsToBuy = group.items.filter((item) => item.missingG > 0);

          if (itemsToBuy.length === 0) {
            return null;
          }

          return (
            <div
              key={group.category}
              className="rounded-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10"
            >
              <div className="mb-3 flex items-center gap-2">
                <ShoppingBagIcon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                <Heading level={3} className="text-base font-semibold">
                  {group.category}
                </Heading>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  ({itemsToBuy.length})
                </span>
              </div>

              <div className="space-y-1">
                {itemsToBuy.map((item) => {
                  const pantryInfo = getPantryInfo(item.nevoCode);
                  const isAdding = addingItems.has(item.nevoCode);
                  const isChecked = checkedItems.has(item.nevoCode);

                  return (
                    <div
                      key={item.nevoCode}
                      className={`flex items-center gap-3 rounded-lg p-2 transition-colors ${isChecked ? 'bg-green-50 dark:bg-green-950/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'} `}
                    >
                      <button
                        onClick={() => handleToggleItem(item.nevoCode)}
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-all ${
                          isChecked
                            ? 'border-green-600 bg-green-600'
                            : 'border-zinc-300 hover:border-green-500 dark:border-zinc-600'
                        } `}
                        title={isChecked ? 'Geselecteerd' : 'Selecteer'}
                      >
                        {isChecked && (
                          <CheckCircleIcon className="h-3.5 w-3.5 text-white" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-zinc-950 dark:text-white">
                            {item.name}
                          </span>
                          {pantryInfo && (
                            <Badge color="green" className="text-xs">
                              In voorraad
                              {pantryInfo.type === 'quantity' &&
                              pantryInfo.value != null
                                ? ` (${pantryInfo.value.toFixed(0)}g)`
                                : ''}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                            {item.missingG.toFixed(0)}g nodig
                          </Text>
                          {pantryInfo &&
                            pantryInfo.type === 'quantity' &&
                            pantryInfo.value != null && (
                              <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                                • {pantryInfo.value.toFixed(0)}g in voorraad
                              </Text>
                            )}
                        </div>
                        {primaryStore && (
                          <div className="mt-2 space-y-1 rounded-lg bg-muted/20 p-2">
                            <Text className="text-xs font-medium text-muted-foreground">
                              Kopen bij: {primaryStore.name}
                            </Text>
                            {item.canonicalIngredientId ? (
                              (() => {
                                const key = linkKey(
                                  item.canonicalIngredientId,
                                  primaryStore.id,
                                );
                                const link = linkByKey[key];
                                return (
                                  <div className="flex flex-wrap items-center gap-2">
                                    {link ? (
                                      <>
                                        <Text className="text-sm text-foreground">
                                          {link.storeProduct.title}
                                          {link.storeProduct.brand
                                            ? ` (${link.storeProduct.brand})`
                                            : ''}
                                        </Text>
                                        <Button
                                          onClick={() =>
                                            openChooseProductModal({
                                              canonicalIngredientId:
                                                item.canonicalIngredientId!,
                                              nevoCode: item.nevoCode,
                                              name: item.name,
                                            })
                                          }
                                          plain
                                          className="h-6 !p-0 text-xs"
                                        >
                                          <PencilSquareIcon className="mr-0.5 h-3.5 w-3.5" />
                                          Wijzig
                                        </Button>
                                      </>
                                    ) : (
                                      <Button
                                        onClick={() =>
                                          openChooseProductModal({
                                            canonicalIngredientId:
                                              item.canonicalIngredientId!,
                                            nevoCode: item.nevoCode,
                                            name: item.name,
                                          })
                                        }
                                        plain
                                        className="h-7 text-sm"
                                      >
                                        <MagnifyingGlassIcon className="mr-1 h-3.5 w-3.5" />
                                        Kies product
                                      </Button>
                                    )}
                                  </div>
                                );
                              })()
                            ) : (
                              <Text className="text-xs text-muted-foreground">
                                Koppeling nog niet beschikbaar
                              </Text>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold whitespace-nowrap text-red-600 dark:text-red-400">
                          {item.missingG.toFixed(0)}g
                        </div>
                        <Button
                          onClick={() =>
                            handleAddToPantry(item.nevoCode, item.missingG)
                          }
                          disabled={isAdding}
                          plain
                          className="h-7 w-7 !min-w-0 !p-0"
                          title="Voeg toe aan pantry"
                        >
                          {isAdding ? (
                            <ArrowPathIcon
                              className="h-3.5 w-3.5 animate-spin"
                              data-slot="icon"
                            />
                          ) : (
                            <PlusIcon
                              className="h-3.5 w-3.5"
                              data-slot="icon"
                            />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!modalItem} onClose={closeModal}>
        <DialogTitle>Kies product</DialogTitle>
        <DialogBody>
          <DialogDescription>
            {modalItem
              ? `Zoek een product voor: ${modalItem.name}`
              : 'Zoek een product'}
          </DialogDescription>
          <form onSubmit={handleSearchSubmit} className="mt-4 space-y-4">
            <div className="flex gap-2">
              <Input
                type="search"
                placeholder="Zoek op naam of merk..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button type="submit" disabled={searchLoading}>
                {searchLoading ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <MagnifyingGlassIcon className="h-4 w-4" />
                )}
                Zoeken
              </Button>
            </div>
            {modalError && (
              <div
                className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-200"
                role="alert"
              >
                {modalError}
              </div>
            )}
            {searchQuery.trim() === '' &&
              searchResults.length === 0 &&
              !searchLoading && (
                <Text className="text-sm text-muted-foreground">
                  Typ om te zoeken
                </Text>
              )}
            {searchQuery.trim() !== '' &&
              searchResults.length === 0 &&
              !searchLoading && (
                <Text className="text-sm text-muted-foreground">
                  Geen resultaten
                </Text>
              )}
            {searchResults.length > 0 && (
              <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg bg-muted/20 p-2">
                {searchResults.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectProduct(product)}
                      disabled={upserting}
                      className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
                    >
                      <span className="font-medium text-foreground">
                        {product.title}
                      </span>
                      {product.brand && (
                        <span className="ml-1 text-sm text-muted-foreground">
                          ({product.brand})
                        </span>
                      )}
                      {product.priceCents != null && (
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          €{(product.priceCents / 100).toFixed(2)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={closeModal}>
            Sluiten
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
