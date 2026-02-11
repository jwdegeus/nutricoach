'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Field, Label } from '@/components/catalyst/fieldset';
import { Input } from '@/components/catalyst/input';
import { searchStoreProductsAction } from '@/src/app/(app)/actions/store-catalog.search.actions';
import type { StoreProductSearchItem } from '@/src/app/(app)/actions/store-catalog.search.actions';

const DEBOUNCE_MS = 280;

function formatPrice(
  cents: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  if (currency?.toUpperCase() !== 'EUR') return '';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export type StoreProductSearchPickerProps = {
  storeId?: string;
  onSelect: (item: StoreProductSearchItem) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export function StoreProductSearchPicker({
  storeId,
  onSelect,
  placeholder = 'Zoek winkelproduct…',
  autoFocus,
}: StoreProductSearchPickerProps) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<StoreProductSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setItems([]);
        setLoading(false);
        return;
      }
      const id = ++requestIdRef.current;
      setLoading(true);
      searchStoreProductsAction({ q: trimmed, storeId, limit: 20 }).then(
        (res) => {
          if (id !== requestIdRef.current) return;
          setItems(res.items);
          setLoading(false);
        },
      );
    },
    [storeId],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setItems([]);
      return () => {};
    }
    debounceRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
    };
  }, [q, runSearch]);

  const handleSelect = useCallback(
    (item: StoreProductSearchItem) => {
      onSelect(item);
      setQ('');
      setItems([]);
    },
    [onSelect],
  );

  const showDropdown = q.trim().length >= 2;
  const empty = showDropdown && !loading && items.length === 0;
  const hasResults = showDropdown && items.length > 0;

  return (
    <Field>
      <Label>Product</Label>
      <div className="relative w-full">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          aria-label={placeholder}
          aria-expanded={hasResults || empty}
          aria-haspopup="listbox"
          aria-controls="store-product-search-list"
          id="store-product-search-input"
          className="w-full"
        />
        {(hasResults || empty || loading) && (
          <div
            id="store-product-search-list"
            role="listbox"
            className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-xl bg-white/95 shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-900/95 dark:ring-white/10"
          >
            {loading && (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                Zoeken…
              </div>
            )}
            {empty && !loading && (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                Geen resultaten
              </div>
            )}
            {hasResults &&
              items.map((item) => {
                const priceStr = formatPrice(item.priceCents, item.currency);
                const right = [item.unitLabel, priceStr]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-left outline-hidden hover:bg-zinc-100 focus:bg-zinc-100 sm:py-2 dark:hover:bg-white/10 dark:focus:bg-white/10"
                    onClick={() => handleSelect(item)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {item.title}
                      </span>
                      {item.brand && (
                        <span className="block truncate text-sm text-muted-foreground">
                          {item.brand}
                        </span>
                      )}
                    </span>
                    {right && (
                      <span className="shrink-0 text-sm whitespace-nowrap text-muted-foreground">
                        {right}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        )}
      </div>
    </Field>
  );
}
