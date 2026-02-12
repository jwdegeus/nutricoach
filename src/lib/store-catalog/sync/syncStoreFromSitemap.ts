/**
 * Sync store catalog from sitemap URLs: batch extract + idempotent upsert.
 * Uses admin client only; no URLs in logs. Server-only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extractProductFromUrl,
  StoreCatalogExtractError,
  type StoreProductExtract,
} from '@/src/lib/store-catalog/extractors/productDetail.extractor';

const EXTRACT_TIMEOUT_MS = 15_000;
const DEFAULT_DETAIL_BATCH_SIZE = 200;
const DEFAULT_DETAIL_CONCURRENCY = 3;

export type SitemapUrlEntry = { loc: string; lastmod?: string };

export type StoreSyncConfig = {
  detailBatchSize?: number;
  detailConcurrency?: number;
  fullSync?: boolean;
  /** Requests per second for detail fetches; used to throttle. */
  rateLimitRps?: number;
  /** Ms to wait between starting each detail fetch (overrides rateLimitRps when set). Use 2000 for strict sites like Ekoplaza. */
  detailDelayMs?: number;
};

export type SyncStoreFromSitemapResult = {
  processed: number;
  upserted: number;
  variantsUpserted: number;
  extractFailed: number;
  noProductFound: number;
  deactivated: number;
  /** Sample of extract error codes (e.g. PARSE_FAILED, FETCH_FAILED) for diagnostics. */
  extractErrorCodes: string[];
};

export type SyncStoreFromSitemapParams = {
  admin: SupabaseClient;
  storeId: string;
  connectorConfig: StoreSyncConfig | null;
  urls: SitemapUrlEntry[];
  /** ISO timestamp of run start; used for deactivate sweep in full mode */
  runStartedAt: string;
  /** If true, process all URLs in chunks and run deactivate sweep after */
  fullSync?: boolean;
  /**
   * When set: rewrite product URL origins to match this base URL.
   * Fixes sitemaps that list versenoten.nl while product pages only work on www.versenoten.nl.
   */
  baseUrl?: string;
};

function parseLastmod(lastmod: string | undefined): string | null {
  if (!lastmod || typeof lastmod !== 'string') return null;
  const trimmed = lastmod.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run up to `concurrency` tasks at a time; optionally throttle starts by minIntervalMs.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  minIntervalMs = 0,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  let nextStartTime = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      const item = items[i];
      if (minIntervalMs > 0) {
        const now = Date.now();
        if (now < nextStartTime) await sleep(nextStartTime - now);
        nextStartTime = Math.max(nextStartTime, Date.now()) + minIntervalMs;
      }
      const result = await fn(item);
      results[i] = result;
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Process one chunk of URLs: extract + upsert; return outcomes and aggregated counts.
 */
const MAX_EXTRACT_ERROR_CODES_SAMPLE = 5;

async function processChunk(
  admin: SupabaseClient,
  storeId: string,
  chunk: SitemapUrlEntry[],
  concurrency: number,
  minIntervalMs: number,
): Promise<{
  processed: number;
  upserted: number;
  variantsUpserted: number;
  extractFailed: number;
  noProductFound: number;
  extractErrorCodes: string[];
}> {
  type Outcome =
    | { kind: 'upserted'; variantsCount: number }
    | { kind: 'extractFailed'; code: string }
    | { kind: 'noProductFound' };

  const outcomes = await runWithConcurrency(
    chunk,
    concurrency,
    async (entry): Promise<Outcome> => {
      let extract: StoreProductExtract;
      try {
        extract = await extractProductFromUrl(entry.loc, {
          timeoutMs: EXTRACT_TIMEOUT_MS,
        });
      } catch (err) {
        if (err instanceof StoreCatalogExtractError) {
          if (err.code === 'NO_PRODUCT_FOUND')
            return { kind: 'noProductFound' };
          const code =
            err.status != null
              ? `${err.code}:${err.status}`
              : err.hint
                ? `${err.code}:${err.hint}`
                : err.code;
          return { kind: 'extractFailed', code };
        }
        return { kind: 'extractFailed', code: 'UNKNOWN' };
      }

      const lastmod = parseLastmod(entry.lastmod);

      const { error: upsertError, data: productRow } = await admin
        .from('store_products')
        .upsert(
          {
            store_id: storeId,
            external_key: extract.externalKey,
            product_url: extract.productUrl,
            title: extract.title,
            image_url: extract.imageUrl ?? null,
            brand: extract.brand ?? null,
            category_path: extract.categoryPath ?? null,
            currency: extract.currency ?? null,
            price_cents: extract.priceCents ?? null,
            availability: extract.availability ?? null,
            unit_label: extract.unitLabel ?? null,
            sku: extract.sku ?? null,
            gtin: extract.gtin ?? null,
            lastmod,
            last_seen_at: new Date().toISOString(),
            is_active: true,
            raw_source: extract.rawSource ?? null,
          },
          { onConflict: 'store_id,external_key' },
        )
        .select('id')
        .single();

      if (upsertError || !productRow)
        return { kind: 'extractFailed', code: 'UPSERT_FAILED' };

      let variantsCount = 0;
      if (extract.variants?.length) {
        const variantRows = extract.variants.map((v) => ({
          store_product_id: productRow.id,
          variant_key: v.variantKey,
          title: v.title ?? null,
          price_cents: v.priceCents ?? null,
          currency: v.currency ?? null,
          sku: v.sku ?? null,
          gtin: v.gtin ?? null,
          is_active: true,
        }));
        const { error: varError } = await admin
          .from('store_product_variants')
          .upsert(variantRows, {
            onConflict: 'store_product_id,variant_key',
          });
        if (!varError) variantsCount = variantRows.length;
      }

      return { kind: 'upserted', variantsCount };
    },
    minIntervalMs,
  );

  let processed = 0;
  let upserted = 0;
  let variantsUpserted = 0;
  let extractFailed = 0;
  let noProductFound = 0;
  const codeSet = new Set<string>();
  for (const o of outcomes) {
    processed += 1;
    if (o.kind === 'upserted') {
      upserted += 1;
      variantsUpserted += o.variantsCount;
    } else if (o.kind === 'noProductFound') noProductFound += 1;
    else {
      extractFailed += 1;
      if (codeSet.size < MAX_EXTRACT_ERROR_CODES_SAMPLE) codeSet.add(o.code);
    }
  }
  return {
    processed,
    upserted,
    variantsUpserted,
    extractFailed,
    noProductFound,
    extractErrorCodes: Array.from(codeSet),
  };
}

/**
 * Deactivate store_products not seen in this run (last_seen_at < runStartedAt). Returns count updated.
 */
async function deactivateUnseen(
  admin: SupabaseClient,
  storeId: string,
  runStartedAt: string,
): Promise<number> {
  const { data, error } = await admin
    .from('store_products')
    .update({ is_active: false })
    .eq('store_id', storeId)
    .lt('last_seen_at', runStartedAt)
    .eq('is_active', true)
    .select('id');

  if (error) return 0;
  return Array.isArray(data) ? data.length : 0;
}

/**
 * Rewrite URL origin to baseUrl when they differ (fixes www vs non-www mismatch).
 */
function rewriteToBaseUrl(loc: string, baseUrl: string): string {
  try {
    const locUrl = new URL(loc);
    const baseUrlParsed = new URL(baseUrl);
    if (locUrl.origin === baseUrlParsed.origin) return loc;
    return baseUrlParsed.origin + locUrl.pathname + locUrl.search + locUrl.hash;
  } catch {
    return loc;
  }
}

/**
 * Dedupe by loc; in full mode process all URLs in chunks, else first batch only. Optionally run deactivate sweep.
 */
export async function syncStoreFromSitemap({
  admin,
  storeId,
  connectorConfig,
  urls,
  runStartedAt,
  fullSync = false,
  baseUrl,
}: SyncStoreFromSitemapParams): Promise<SyncStoreFromSitemapResult> {
  const seen = new Set<string>();
  const deduped: SitemapUrlEntry[] = [];
  for (const u of urls) {
    let loc = u.loc?.trim();
    if (!loc) continue;
    if (baseUrl) loc = rewriteToBaseUrl(loc, baseUrl);
    if (seen.has(loc)) continue;
    seen.add(loc);
    deduped.push({ loc, lastmod: u.lastmod });
  }

  const chunkSize =
    typeof connectorConfig?.detailBatchSize === 'number' &&
    connectorConfig.detailBatchSize > 0
      ? connectorConfig.detailBatchSize
      : DEFAULT_DETAIL_BATCH_SIZE;
  const concurrency =
    typeof connectorConfig?.detailConcurrency === 'number' &&
    connectorConfig.detailConcurrency > 0
      ? connectorConfig.detailConcurrency
      : DEFAULT_DETAIL_CONCURRENCY;

  let minIntervalMs = 0;
  if (
    typeof connectorConfig?.detailDelayMs === 'number' &&
    connectorConfig.detailDelayMs > 0
  ) {
    minIntervalMs = connectorConfig.detailDelayMs;
  } else if (
    typeof connectorConfig?.rateLimitRps === 'number' &&
    connectorConfig.rateLimitRps > 0
  ) {
    minIntervalMs = Math.ceil(1000 / connectorConfig.rateLimitRps);
  }

  const result: SyncStoreFromSitemapResult = {
    processed: 0,
    upserted: 0,
    variantsUpserted: 0,
    extractFailed: 0,
    noProductFound: 0,
    deactivated: 0,
    extractErrorCodes: [],
  };

  const urlsToProcess = fullSync ? deduped : deduped.slice(0, chunkSize);
  const allErrorCodes = new Set<string>();

  for (let offset = 0; offset < urlsToProcess.length; offset += chunkSize) {
    const chunk = urlsToProcess.slice(offset, offset + chunkSize);
    const chunkResult = await processChunk(
      admin,
      storeId,
      chunk,
      concurrency,
      minIntervalMs,
    );
    result.processed += chunkResult.processed;
    result.upserted += chunkResult.upserted;
    result.variantsUpserted += chunkResult.variantsUpserted;
    result.extractFailed += chunkResult.extractFailed;
    result.noProductFound += chunkResult.noProductFound;
    for (const code of chunkResult.extractErrorCodes) {
      if (allErrorCodes.size < MAX_EXTRACT_ERROR_CODES_SAMPLE)
        allErrorCodes.add(code);
    }
  }
  result.extractErrorCodes = Array.from(allErrorCodes);

  if (fullSync && runStartedAt) {
    result.deactivated = await deactivateUnseen(admin, storeId, runStartedAt);
  }

  return result;
}
