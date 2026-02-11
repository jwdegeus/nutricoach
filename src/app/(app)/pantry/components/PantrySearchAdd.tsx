'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/catalyst/input';
import { Button } from '@/components/catalyst/button';
import { Link } from '@/components/catalyst/link';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogDescription,
} from '@/components/catalyst/dialog';
import {
  searchNevoFoodsAction,
  suggestNevoMatchesForScannedProductAction,
  searchExternalProductsAction,
  upsertUserPantryItemAction,
  lookupProductByBarcodeAction,
} from '../actions/pantry-ui.actions';
import { useRouter } from 'next/navigation';
import {
  ArrowPathIcon,
  PlusIcon,
  QrCodeIcon,
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/16/solid';
import { BarcodeScanner } from './BarcodeScanner';
import type {
  ExternalProduct,
  ProductSourceId,
} from '@/src/lib/pantry/sources';
import { useToast } from '@/src/components/app/ToastContext';

/** Tiny source logo (OFF or AH) with text fallback when image fails to load */
function SourceLogo({
  source,
  className = 'size-5',
}: {
  source: ProductSourceId;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [source]);

  if (source === 'openfoodfacts') {
    if (imgFailed) {
      return (
        <span
          className={`inline-flex items-center justify-center rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 uppercase dark:text-amber-400 ${className}`}
          title="Open Food Facts"
        >
          OFF
        </span>
      );
    }
    return (
      <img
        src="https://static.openfoodfacts.org/images/logos/off-logo-en-50x50.png"
        alt="Open Food Facts"
        className={className}
        width={20}
        height={20}
        onError={() => setImgFailed(true)}
      />
    );
  }
  if (source === 'albert_heijn') {
    if (imgFailed) {
      return (
        <span
          className={`inline-flex items-center justify-center rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 uppercase dark:text-blue-400 ${className}`}
          title="Albert Heijn"
        >
          AH
        </span>
      );
    }
    return (
      <img
        src="https://www.ah.nl/favicon.ico"
        alt="Albert Heijn"
        className={className}
        width={20}
        height={20}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return null;
}

type NevoFoodResult = {
  nevoCode: string;
  name: string;
};

function NutriScoreBadge({ grade }: { grade: 'A' | 'B' | 'C' | 'D' | 'E' }) {
  const colors: Record<string, string> = {
    A: 'bg-green-600 text-white',
    B: 'bg-lime-500 text-white',
    C: 'bg-yellow-500 text-white',
    D: 'bg-orange-500 text-white',
    E: 'bg-red-600 text-white',
  };
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${colors[grade] ?? 'bg-muted text-muted-foreground'}`}
    >
      {grade}
    </span>
  );
}

export function PantrySearchAdd() {
  const t = useTranslations('pantry');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const router = useRouter();

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isBarcodeLookupInProgress, setIsBarcodeLookupInProgress] =
    useState(false);

  // Search modal state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NevoFoodResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [offSearchQuery, setOffSearchQuery] = useState('');
  const [offSearchResults, setOffSearchResults] = useState<ExternalProduct[]>(
    [],
  );
  const [offSearching, setOffSearching] = useState(false);
  const [offSearchRateLimited, setOffSearchRateLimited] = useState<
    string | null
  >(null);
  const [offSearchCooldownUntil, setOffSearchCooldownUntil] =
    useState<number>(0);

  // Scan modal state
  const [scannedProduct, setScannedProduct] = useState<ExternalProduct | null>(
    null,
  );
  const [scanLookupMessage, setScanLookupMessage] = useState<string | null>(
    null,
  );
  const [scanQuery, setScanQuery] = useState('');
  const [nevoMatches, setNevoMatches] = useState<NevoFoodResult[]>([]);
  const [nevoMatchSearching, setNevoMatchSearching] = useState(false);

  const resetSearchModal = useCallback(() => {
    setQuery('');
    setResults([]);
    setOffSearchQuery('');
    setOffSearchResults([]);
    setOffSearchRateLimited(null);
    setOffSearchCooldownUntil(0);
  }, []);

  const resetScanModal = useCallback(() => {
    setScannedProduct(null);
    setScanLookupMessage(null);
    setScanQuery('');
    setNevoMatches([]);
    setManualBarcode('');
    setIsBarcodeLookupInProgress(false);
  }, []);

  // Debounced ingredients search (search modal)
  useEffect(() => {
    if (!searchModalOpen || !query.trim()) {
      setResults([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchNevoFoodsAction(query);
      setIsSearching(false);
      if (result.ok) setResults(result.data);
      else setResults([]);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchModalOpen, query]);

  const handleBarcode = useCallback(
    async (barcode: string) => {
      const trimmed = barcode.replace(/\s/g, '');
      if (!trimmed) return;

      setScanLookupMessage(null);
      setScannedProduct(null);
      setNevoMatches([]);
      setIsBarcodeLookupInProgress(true);

      try {
        const result = await lookupProductByBarcodeAction(trimmed);
        if (!result.ok) {
          setScanLookupMessage(result.error.message);
          return;
        }
        if (result.data.found && result.data.product) {
          setScannedProduct(result.data.product);
          setScanQuery(result.data.product.name);
          setManualBarcode('');
        } else {
          setScanLookupMessage(
            result.data.found === false
              ? (result.data.message ?? t('barcodeLookupError'))
              : t('barcodeLookupError'),
          );
        }
      } finally {
        setIsBarcodeLookupInProgress(false);
      }
    },
    [t],
  );

  // When scanned product exists and scanQuery changed, run ingredient suggestions (scan modal)
  useEffect(() => {
    if (!scanModalOpen || !scannedProduct || !scanQuery.trim()) {
      setNevoMatches([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      setNevoMatchSearching(true);
      const trimmed = scanQuery.trim();
      const useSmartSuggest = trimmed === scannedProduct.name.trim();
      const result = useSmartSuggest
        ? await suggestNevoMatchesForScannedProductAction(
            scannedProduct.name,
            scannedProduct.brand || undefined,
          )
        : await searchNevoFoodsAction(trimmed);
      setNevoMatchSearching(false);
      if (result.ok) setNevoMatches(result.data);
      else setNevoMatches([]);
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [scanModalOpen, scannedProduct, scanQuery]);

  const handleAddByNevo = useCallback(
    async (food: NevoFoodResult) => {
      setIsAdding(food.nevoCode);
      try {
        const result = await upsertUserPantryItemAction({
          nevoCode: food.nevoCode,
          isAvailable: true,
          availableG: null,
        });
        if (result.ok) {
          router.refresh();
          setQuery('');
          setResults([]);
          setScannedProduct(null);
          setNevoMatches([]);
        } else {
          const msg =
            result.error?.message ??
            (typeof result.error === 'object'
              ? JSON.stringify(result.error)
              : String(result.error));
          showToast({
            type: 'error',
            title: t('addToPantryError'),
            description: msg || undefined,
          });
        }
      } finally {
        setIsAdding(null);
      }
    },
    [router, showToast, t],
  );

  const handleAddAsExternal = useCallback(
    async (product: ExternalProduct) => {
      const key = product.barcode ?? product.name;
      setIsAdding(key);
      try {
        const barcode = product.barcode?.trim();
        if (!barcode) {
          console.error('External product has no barcode');
          return;
        }
        const result = await upsertUserPantryItemAction({
          barcode,
          source: product.source,
          displayName: product.name.trim() || product.name,
          imageUrl: product.imageUrl?.trim() || null,
          productUrl: product.productUrl?.trim() || null,
          isAvailable: true,
          availableG: null,
        });
        if (result.ok) {
          router.refresh();
          setScannedProduct(null);
          setScanQuery('');
          setNevoMatches([]);
          setOffSearchResults((prev) => prev.filter((p) => p !== product));
        } else {
          const msg =
            result.error?.message ??
            (typeof result.error === 'object'
              ? JSON.stringify(result.error)
              : String(result.error));
          showToast({
            type: 'error',
            title: t('addToPantryError'),
            description: msg || undefined,
          });
        }
      } finally {
        setIsAdding(null);
      }
    },
    [router, showToast, t],
  );

  const runOffSearch = useCallback(async () => {
    if (!offSearchQuery.trim() || offSearching) return;
    if (Date.now() < offSearchCooldownUntil) return;
    setOffSearchRateLimited(null);
    setOffSearchResults([]);
    setOffSearching(true);
    const result = await searchExternalProductsAction(offSearchQuery.trim());
    setOffSearching(false);
    if (!result.ok) {
      setOffSearchRateLimited(result.error.message);
      return;
    }
    if ('rateLimited' in result.data && result.data.rateLimited) {
      setOffSearchRateLimited(result.data.message ?? 'Te veel zoekverzoeken.');
      setOffSearchCooldownUntil(Date.now() + 60_000);
      return;
    }
    if ('products' in result.data) {
      setOffSearchResults(result.data.products);
    }
  }, [offSearchQuery, offSearching]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t('addIngredient')}
        </h2>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => {
            setScanModalOpen(true);
            resetScanModal();
          }}
          className="inline-flex items-center gap-2"
        >
          <QrCodeIcon className="size-5" />
          {t('scanBarcode')}
        </Button>
        <Button
          outline
          onClick={() => {
            setSearchModalOpen(true);
            resetSearchModal();
          }}
          className="inline-flex items-center gap-2"
        >
          <MagnifyingGlassIcon className="size-5" />
          {t('searchProduct')}
        </Button>
      </div>

      {/* Scan barcode modal */}
      <Dialog
        open={scanModalOpen}
        onClose={(value) => {
          setScanModalOpen(value);
          if (!value) resetScanModal();
        }}
        size="2xl"
      >
        <DialogTitle>{t('scanBarcode')}</DialogTitle>
        <DialogDescription>{t('scanAreaHint')}</DialogDescription>
        <DialogBody>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="block text-sm font-medium text-foreground">
                {t('barcodeEnterManually')}
              </label>
              <Input
                type="tel"
                inputMode="numeric"
                placeholder={t('barcodePlaceholder')}
                value={manualBarcode}
                onChange={(e) =>
                  setManualBarcode(e.target.value.replace(/\D/g, ''))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleBarcode(manualBarcode.trim());
                  }
                }}
                className="mt-1"
                disabled={isBarcodeLookupInProgress}
              />
            </div>
            <Button
              onClick={() => void handleBarcode(manualBarcode.trim())}
              disabled={!manualBarcode.trim() || isBarcodeLookupInProgress}
            >
              {isBarcodeLookupInProgress ? (
                <ArrowPathIcon className="size-4 animate-spin" />
              ) : (
                t('barcodeLookupButton')
              )}
            </Button>
          </div>
          {scanModalOpen && (
            <BarcodeScanner
              onBarcode={handleBarcode}
              onError={(msg) => setScanLookupMessage(msg)}
            />
          )}
          {isBarcodeLookupInProgress && !scannedProduct && (
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {t('barcodeLookupInProgress')}
            </p>
          )}
          {scanLookupMessage &&
            !scannedProduct &&
            !isBarcodeLookupInProgress && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                {scanLookupMessage}
              </p>
            )}
          {scannedProduct && (
            <div className="mt-4 space-y-4 rounded-2xl bg-muted/30 p-4 shadow-sm outline outline-1 -outline-offset-1 outline-white/10">
              <p className="text-sm font-medium text-foreground">
                {t('scanProductFound')}
              </p>
              <div className="flex items-start gap-4">
                {scannedProduct.imageUrl && (
                  <img
                    src={scannedProduct.imageUrl}
                    alt=""
                    className="size-16 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {scannedProduct.name}
                  </p>
                  {scannedProduct.brand && (
                    <p className="text-sm text-muted-foreground">
                      {scannedProduct.brand}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <SourceLogo
                        source={scannedProduct.source}
                        className="size-4"
                      />
                      {scannedProduct.source === 'albert_heijn'
                        ? t('sourceAlbertHeijn')
                        : t('sourceOpenFoodFacts')}
                      {scannedProduct.source === 'openfoodfacts' && (
                        <span className="text-muted-foreground/80">
                          ({t('scanSourceFallback')})
                        </span>
                      )}
                    </span>
                    {scannedProduct.nutriscoreGrade && (
                      <NutriScoreBadge grade={scannedProduct.nutriscoreGrade} />
                    )}
                    {scannedProduct.productUrl && (
                      <Link
                        href={scannedProduct.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        {scannedProduct.source === 'albert_heijn' ? (
                          <>
                            <ShoppingBagIcon className="size-3.5" />
                            {t('orderAtAh')}
                          </>
                        ) : (
                          <>
                            <ArrowTopRightOnSquareIcon className="size-3.5" />
                            {t('viewOnOff')}
                          </>
                        )}
                      </Link>
                    )}
                  </div>
                </div>
                {scannedProduct.barcode && (
                  <Button
                    plain
                    onClick={() => handleAddAsExternal(scannedProduct)}
                    disabled={
                      isAdding ===
                      (scannedProduct.barcode ?? scannedProduct.name)
                    }
                    className="shrink-0 rounded-full bg-primary-500 p-2 text-white hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                    title={t('addAsProductName', { name: scannedProduct.name })}
                  >
                    {isAdding ===
                    (scannedProduct.barcode ?? scannedProduct.name) ? (
                      <ArrowPathIcon
                        aria-hidden
                        className="size-5 animate-spin"
                      />
                    ) : (
                      <PlusIcon aria-hidden className="size-5" />
                    )}
                  </Button>
                )}
              </div>

              <div className="space-y-2 pt-2">
                <p className="text-sm text-muted-foreground">
                  {t('orSearchIngredient')}
                </p>
                <Input
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  className="w-full rounded-lg bg-background"
                />
                {nevoMatchSearching && (
                  <p className="text-sm text-muted-foreground">{t('adding')}</p>
                )}
                {nevoMatches.length > 0 && (
                  <ul className="max-h-48 space-y-1 overflow-y-auto">
                    {nevoMatches.map((food) => (
                      <li
                        key={food.nevoCode}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/50"
                      >
                        <span className="text-sm">{food.name}</span>
                        <Button
                          plain
                          onClick={() => handleAddByNevo(food)}
                          disabled={isAdding === food.nevoCode}
                        >
                          {isAdding === food.nevoCode ? (
                            <ArrowPathIcon className="size-4 animate-spin" />
                          ) : (
                            <>
                              <PlusIcon className="mr-1 size-4" />
                              {t('addToPantry')}
                            </>
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {scanQuery.trim() &&
                  !nevoMatchSearching &&
                  nevoMatches.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t('noIngredientResults')}
                    </p>
                  )}
              </div>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button
            plain
            onClick={() => {
              setScanModalOpen(false);
              resetScanModal();
            }}
          >
            {t('close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Zoek product modal */}
      <Dialog
        open={searchModalOpen}
        onClose={(value) => {
          setSearchModalOpen(value);
          if (!value) resetSearchModal();
        }}
        size="2xl"
      >
        <DialogTitle>{t('searchProduct')}</DialogTitle>
        <DialogDescription>{t('searchModalDescription')}</DialogDescription>
        <DialogBody>
          <div className="space-y-6">
            {/* Ingrediënten (eigen database) */}
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">
                {t('ingredientsSection')}
              </p>
              <div className="relative">
                <Input
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-xl bg-muted/30 shadow-sm outline outline-1 -outline-offset-1 outline-white/10 focus-visible:ring-2"
                />
                {isSearching && (
                  <div className="absolute top-1/2 right-3 -translate-y-1/2">
                    <ArrowPathIcon className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              {results.length > 0 && (
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                  {results.map((food) => (
                    <div
                      key={food.nevoCode}
                      className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2 shadow-sm outline outline-1 -outline-offset-1 outline-white/10"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {food.name}
                      </span>
                      <Button
                        plain
                        onClick={() => handleAddByNevo(food)}
                        disabled={isAdding === food.nevoCode}
                        className="shrink-0 rounded-full bg-primary-500 p-1.5 text-white hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                        title={t('addToPantry')}
                      >
                        {isAdding === food.nevoCode ? (
                          <ArrowPathIcon
                            aria-hidden
                            className="size-5 animate-spin"
                          />
                        ) : (
                          <PlusIcon aria-hidden className="size-5" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {query && !isSearching && results.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('noResults')}
                </p>
              )}
            </div>

            {/* Productbronnen (OFF, AH, …) */}
            <div className="rounded-2xl bg-muted/30 p-4 shadow-sm outline outline-1 -outline-offset-1 outline-white/10">
              <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                <span>{t('productSourcesTitle')}</span>
                <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <SourceLogo source="albert_heijn" className="size-4" />
                  <span>{t('sourceAlbertHeijn')}</span>
                  <span aria-hidden>·</span>
                  <SourceLogo source="openfoodfacts" className="size-4" />
                  <span>{t('sourceOpenFoodFacts')}</span>
                </span>
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                {t('productSourcesDescription')} {t('productSourcesRateLimit')}
              </p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder={t('searchPlaceholderOff')}
                  value={offSearchQuery}
                  onChange={(e) => {
                    setOffSearchQuery(e.target.value);
                    setOffSearchRateLimited(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && runOffSearch()}
                  className="flex-1 rounded-lg bg-background"
                />
                <Button
                  onClick={runOffSearch}
                  disabled={
                    offSearching ||
                    !offSearchQuery.trim() ||
                    Date.now() < offSearchCooldownUntil
                  }
                >
                  {offSearching ? (
                    <ArrowPathIcon className="size-4 animate-spin" />
                  ) : (
                    tCommon('search')
                  )}
                </Button>
              </div>
              {offSearchRateLimited && (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                  {offSearchRateLimited}
                </p>
              )}
              {offSearchCooldownUntil > Date.now() && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Opnieuw zoeken mogelijk over{' '}
                  {Math.ceil((offSearchCooldownUntil - Date.now()) / 1000)} s
                </p>
              )}
              {offSearchResults.length > 0 && (
                <ul className="mt-3 max-h-48 divide-y divide-white/10 overflow-y-auto rounded-lg bg-background shadow-sm outline outline-1 -outline-offset-1 outline-white/10">
                  {offSearchResults.map((product, index) => (
                    <li
                      key={`${product.source}-${product.barcode ?? ''}-${product.name}-${index}`}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <SourceLogo
                        source={product.source}
                        className="size-5 shrink-0"
                      />
                      {product.imageUrl && (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="size-10 shrink-0 rounded object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {product.name}
                        </p>
                        {product.brand && (
                          <p className="truncate text-xs text-muted-foreground">
                            {product.brand}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {product.barcode && (
                          <Button
                            plain
                            onClick={() => handleAddAsExternal(product)}
                            disabled={
                              isAdding === (product.barcode ?? product.name)
                            }
                            className="rounded-full bg-primary-500 p-1.5 text-white hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                            title={t('addAsProductName', {
                              name: product.name,
                            })}
                          >
                            {isAdding === (product.barcode ?? product.name) ? (
                              <ArrowPathIcon
                                aria-hidden
                                className="size-5 animate-spin"
                              />
                            ) : (
                              <PlusIcon aria-hidden className="size-5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <Button
            plain
            onClick={() => {
              setSearchModalOpen(false);
              resetSearchModal();
            }}
          >
            {t('close')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
