import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { Link } from '@/components/catalyst/link';
import { ProductLinkToIngredientCell } from '@/src/app/(app)/admin/ingredient-product-links/components/ProductLinkToIngredientCell';
import { Badge } from '@/components/catalyst/badge';
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/catalyst/table';
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/16/solid';
import { ClientOnly } from '@/src/components/app/ClientOnly';
import { StoreSyncControls } from './components/StoreSyncControls';
import { StoreSyncSettingsForm } from './components/StoreSyncSettingsForm';
import { StoreSearchForm } from './components/StoreSearchForm';

export const metadata = {
  title: 'Winkelproducten | NutriCoach Admin',
  description: 'Productcatalogus van de winkel',
};

type StoreRow = {
  id: string;
  name: string;
  base_url: string;
  sitemap_url: string | null;
  is_active: boolean;
  connector_config: Record<string, unknown> | null;
  updated_at: string;
};

type ProductRow = {
  id: string;
  title: string;
  brand: string | null;
  unit_label: string | null;
  price_cents: number | null;
  currency: string | null;
  is_active: boolean;
  product_url: string;
  image_url: string | null;
};

type RunRow = {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  stats: unknown;
  error_summary: string | null;
};

const DATE_FMT = new Intl.DateTimeFormat('nl-NL', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDuration(started: string, finished: string | null): string {
  if (finished == null) return '—';
  const a = new Date(started).getTime();
  const b = new Date(finished).getTime();
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `${sec} s`;
  return `${Math.round(sec / 60)} min`;
}

function runStatusBadgeColor(
  status: string,
): 'green' | 'red' | 'amber' | 'zinc' {
  const s = status?.toLowerCase() ?? '';
  if (s === 'succeeded' || s === 'success') return 'green';
  if (s === 'failed' || s === 'error') return 'red';
  if (s === 'running' || s === 'in_progress') return 'amber';
  return 'zinc';
}

function statValue(stats: unknown, key: string): string {
  if (stats == null || typeof stats !== 'object') return '—';
  const v = (stats as Record<string, unknown>)[key];
  if (v === undefined || v === null) return '—';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  return '—';
}

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return '—';
  const amount = (cents / 100).toFixed(2);
  if (currency?.toUpperCase() === 'EUR' || !currency) return `€${amount}`;
  return `${amount} ${currency}`;
}

/** Escape for ILIKE; comma would break .or() filter. */
function ilikePattern(raw: string): string {
  const noComma = raw.replace(/,/g, ' ');
  const escaped = noComma
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
  return `%${escaped}%`;
}

function getNumberConfig(
  cfg: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
  min?: number,
): number {
  if (cfg == null || typeof cfg !== 'object') return fallback;
  const v = cfg[key];
  if (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    (min === undefined || v >= min)
  )
    return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n) && (min === undefined || n >= min)) return n;
  }
  return fallback;
}

function getBoolConfig(
  cfg: Record<string, unknown> | null | undefined,
  key: string,
  fallback: boolean,
): boolean {
  if (cfg == null || typeof cfg !== 'object') return fallback;
  const v = cfg[key];
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) return true;
  if (v === 'false' || v === 0) return false;
  return fallback;
}

type PageProps = {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ q?: string; inactive?: string }>;
};

export default async function AdminStoreDetailPage({
  params,
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) redirect('/dashboard');

  const { storeId } = await params;
  const { q = '', inactive } = await searchParams;
  const showInactive = inactive === '1';
  const query = typeof q === 'string' ? q.trim() : '';
  const hasQuery = query.length >= 2;

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select(
      'id, name, base_url, sitemap_url, is_active, connector_config, updated_at',
    )
    .eq('id', storeId)
    .single();

  if (storeError || !store) {
    notFound();
  }

  const storeRow = store as StoreRow;

  let productsQuery = supabase
    .from('store_products')
    .select(
      'id, title, brand, unit_label, price_cents, currency, is_active, product_url, image_url',
    )
    .eq('store_id', storeId)
    .order('title', { ascending: true })
    .limit(50);

  if (!showInactive) {
    productsQuery = productsQuery.eq('is_active', true);
  }
  if (hasQuery) {
    const pattern = ilikePattern(query);
    productsQuery = productsQuery.or(
      `title.ilike.${pattern},brand.ilike.${pattern}`,
    );
  }

  const { data: products, error: productsError } = await productsQuery;

  const { data: runs } = await supabase
    .from('store_catalog_runs')
    .select('id, status, started_at, finished_at, stats, error_summary')
    .eq('store_id', storeId)
    .order('started_at', { ascending: false })
    .limit(2);

  const runRows = (runs ?? []) as RunRow[];

  if (productsError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950/40 dark:text-red-200">
          Fout bij laden producten: {productsError.message}
        </div>
      </div>
    );
  }

  const productRows = (products ?? []) as ProductRow[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <div>
          <Link
            href="/admin/stores"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            Winkels
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {storeRow.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span title={storeRow.base_url} className="max-w-[280px] truncate">
              {storeRow.base_url}
            </span>
            {storeRow.sitemap_url ? (
              <span
                title={storeRow.sitemap_url}
                className="max-w-[200px] truncate"
              >
                Sitemap: {storeRow.sitemap_url}
              </span>
            ) : (
              <span>Geen sitemap</span>
            )}
            <Badge color={storeRow.is_active ? 'green' : 'amber'}>
              {storeRow.is_active ? 'Actief' : 'Inactief'}
            </Badge>
          </div>
        </div>

        <ClientOnly
          fallback={
            <div
              className="h-20 animate-pulse rounded-xl bg-muted/30"
              aria-hidden
            />
          }
        >
          <StoreSyncControls
            storeId={storeId}
            hasSitemap={!!storeRow.sitemap_url?.trim()}
          />
        </ClientOnly>

        <section className="rounded-2xl bg-muted/30 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Sync instellingen
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">
                Default full sync
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {getBoolConfig(storeRow.connector_config, 'fullSync', false)
                  ? 'Ja'
                  : 'Nee'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                Sitemap URL ingesteld
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {storeRow.sitemap_url?.trim() ? 'Ja' : 'Nee'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground">Sitemap URL</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {storeRow.sitemap_url?.trim() ? (
                  <Link
                    href={storeRow.sitemap_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block max-w-[400px] truncate text-foreground hover:underline"
                    title={storeRow.sitemap_url}
                  >
                    {storeRow.sitemap_url}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
          <ClientOnly
            fallback={
              <div
                className="mt-4 h-48 animate-pulse rounded-lg bg-muted/20"
                aria-hidden
              />
            }
          >
            <StoreSyncSettingsForm
              storeId={storeId}
              rateLimitRps={getNumberConfig(
                storeRow.connector_config,
                'rateLimitRps',
                2,
                1,
              )}
              detailBatchSize={getNumberConfig(
                storeRow.connector_config,
                'detailBatchSize',
                200,
                10,
              )}
              detailConcurrency={getNumberConfig(
                storeRow.connector_config,
                'detailConcurrency',
                3,
                1,
              )}
              detailDelayMs={getNumberConfig(
                storeRow.connector_config,
                'detailDelayMs',
                0,
                0,
              )}
            />
          </ClientOnly>
        </section>

        <section className="rounded-2xl bg-muted/30 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Laatste runs
          </h2>
          {runRows.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nog geen runs. Klik op Sync nu (op de winkellijst).
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Start</TableHeader>
                    <TableHeader>Duur</TableHeader>
                    <TableHeader>Verwerkt</TableHeader>
                    <TableHeader>Toegevoegd</TableHeader>
                    <TableHeader>Varianten</TableHeader>
                    <TableHeader>Fouten</TableHeader>
                    <TableHeader>Geen product</TableHeader>
                    <TableHeader>Gedeactiveerd</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {runRows.map((run) => (
                    <React.Fragment key={run.id}>
                      <TableRow>
                        <TableCell>
                          <Badge color={runStatusBadgeColor(run.status)}>
                            {run.status || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                          {DATE_FMT.format(new Date(run.started_at))}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDuration(run.started_at, run.finished_at)}
                        </TableCell>
                        <TableCell>
                          {statValue(run.stats, 'processed')}
                        </TableCell>
                        <TableCell>
                          {statValue(run.stats, 'upserted')}
                        </TableCell>
                        <TableCell>
                          {statValue(run.stats, 'variantsUpserted')}
                        </TableCell>
                        <TableCell
                          title={(() => {
                            const codes = (
                              run.stats as Record<string, unknown>
                            )?.['extractErrorCodes'];
                            const arr = Array.isArray(codes)
                              ? (codes as string[])
                              : [];
                            if (arr.length === 0) return undefined;
                            const hints: Record<string, string> = {
                              'FETCH_FAILED:403':
                                'Geblokkeerd door site (Forbidden)',
                              'FETCH_FAILED:429': 'Rate limit overschreden',
                              'FETCH_FAILED:network':
                                'Netwerkfout (geen verbinding)',
                              'FETCH_FAILED:timeout': 'Timeout',
                              'FETCH_FAILED:ssl': 'SSL/TLS-fout (certificaat)',
                              'FETCH_FAILED:invalid_url':
                                'Ongeldige URL in sitemap',
                              'FETCH_FAILED:error': 'Onbekende fetch-fout',
                            };
                            return arr.map((c) => hints[c] ?? c).join(' • ');
                          })()}
                        >
                          {(() => {
                            const n = statValue(run.stats, 'extractFailed');
                            const codes = (
                              run.stats as Record<string, unknown>
                            )?.['extractErrorCodes'];
                            const arr = Array.isArray(codes)
                              ? (codes as string[])
                              : null;
                            if (n === '—' || !arr?.length) return n;
                            return `${n} (${arr.join(', ')})`;
                          })()}
                        </TableCell>
                        <TableCell>
                          {statValue(run.stats, 'noProductFound')}
                        </TableCell>
                        <TableCell>
                          {statValue(run.stats, 'deactivated')}
                        </TableCell>
                      </TableRow>
                      {run.status?.toLowerCase() === 'failed' &&
                      run.error_summary ? (
                        <TableRow>
                          <TableCell
                            colSpan={9}
                            className="bg-red-50/50 py-2 text-sm text-muted-foreground dark:bg-red-950/20"
                          >
                            {run.error_summary}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <ClientOnly
          fallback={
            <div
              className="h-12 w-full max-w-md animate-pulse rounded-lg bg-muted/20"
              aria-hidden
            />
          }
        >
          <StoreSearchForm
            storeId={storeId}
            query={query}
            showInactive={showInactive}
          />
        </ClientOnly>

        {productRows.length === 0 ? (
          <div className="rounded-xl bg-muted/30 p-6 text-center text-muted-foreground">
            {hasQuery || showInactive
              ? 'Geen producten gevonden met deze filters.'
              : 'Nog geen producten. Draai een sync.'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-muted/30 shadow-sm">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Titel</TableHeader>
                  <TableHeader>Merk</TableHeader>
                  <TableHeader>Eenheid</TableHeader>
                  <TableHeader>Prijs</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="w-0">Koppel</TableHeader>
                  <TableHeader className="w-0">Open</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {productRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span
                        className="block max-w-[280px] truncate text-foreground"
                        title={row.title}
                      >
                        {row.title}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {row.brand ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {row.unit_label ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatPrice(row.price_cents, row.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge color={row.is_active ? 'green' : 'zinc'}>
                        {row.is_active ? 'Actief' : 'Inactief'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ProductLinkToIngredientCell
                        storeId={storeId}
                        storeProductId={row.id}
                        productTitle={row.title}
                      />
                    </TableCell>
                    <TableCell>
                      {row.product_url ? (
                        <a
                          href={row.product_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        >
                          Open
                          <ArrowTopRightOnSquareIcon className="size-4" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
