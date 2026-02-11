/**
 * Cron endpoint: per active store fetch sitemap, register run, store URL count in stats.
 * Protected by x-cron-secret header or ?secret= (CRON_SECRET env).
 * Uses service_role only in this route (no user context for RLS).
 *
 * @route GET /api/cron/store-catalog
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/src/lib/supabase/admin';
import { harvestSitemapUrls } from '@/src/lib/store-catalog/sitemap/harvestSitemapUrls';
import { syncStoreFromSitemap } from '@/src/lib/store-catalog/sync/syncStoreFromSitemap';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SITEMAP_TIMEOUT_MS = 10_000;

type StoreRow = {
  id: string;
  owner_id: string;
  name: string;
  base_url: string;
  sitemap_url: string | null;
  connector_config: {
    rateLimitRps?: number;
    detailBatchSize?: number;
    detailConcurrency?: number;
    fullSync?: boolean;
  } | null;
  is_active: boolean;
};

function getSafeHost(sitemapUrl: string): string {
  try {
    return new URL(sitemapUrl).hostname;
  } catch {
    return 'unknown';
  }
}

function getCronSecret(req: Request): string | null {
  const header = req.headers.get('x-cron-secret');
  if (header) return header;
  try {
    const u = new URL(req.url);
    return u.searchParams.get('secret');
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not configured' },
      { status: 500 },
    );
  }

  const provided = getCronSecret(req);
  if (provided !== secret) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  let fullMode = false;
  let storeIdParam: string | null = null;
  try {
    const u = new URL(req.url);
    fullMode = u.searchParams.get('full') === '1';
    storeIdParam = u.searchParams.get('storeId');
  } catch {
    // ignore
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Supabase admin client: ${msg}` },
      { status: 500 },
    );
  }

  try {
    return await runStoreCatalogSync(admin, fullMode, storeIdParam);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Sync error: ${msg}` },
      { status: 500 },
    );
  }
}

async function runStoreCatalogSync(
  admin: ReturnType<typeof createAdminClient>,
  fullMode: boolean,
  storeIdParam: string | null,
) {
  let storesQuery = admin
    .from('stores')
    .select(
      'id, owner_id, name, base_url, sitemap_url, connector_config, is_active',
    )
    .eq('is_active', true)
    .not('sitemap_url', 'is', null);

  if (storeIdParam?.trim()) {
    storesQuery = storesQuery.eq('id', storeIdParam.trim());
  }

  const { data: stores, error: fetchError } = await storesQuery;

  if (fetchError) {
    return NextResponse.json(
      { ok: false, error: fetchError.message },
      { status: 500 },
    );
  }

  const activeStores = (stores ?? []) as (StoreRow & { sitemap_url: string })[];
  let succeeded = 0;
  let failed = 0;

  for (const store of activeStores) {
    const sitemapUrl = store.sitemap_url;
    const safeHost = getSafeHost(sitemapUrl);
    const rateLimitRps =
      typeof store.connector_config?.rateLimitRps === 'number'
        ? store.connector_config.rateLimitRps
        : 2;

    const { data: run, error: insertError } = await admin
      .from('store_catalog_runs')
      .insert({
        store_id: store.id,
        status: 'running',
      })
      .select('id, started_at')
      .single();

    if (insertError || !run) {
      console.warn(
        `[store-catalog] store_id=${store.id} safeHost=${safeHost} status=failed error=run_insert`,
      );
      failed++;
      continue;
    }

    const runId = run.id;
    const runStartedAt =
      (run as { started_at?: string }).started_at ?? new Date().toISOString();
    const fullSync = fullMode || store.connector_config?.fullSync === true;

    try {
      const { urls, wasCapped } = await harvestSitemapUrls(sitemapUrl, {
        timeoutMs: SITEMAP_TIMEOUT_MS,
        rateLimitRps,
        urlCap: 50_000,
      });

      const n = urls.length;
      const syncResult = await syncStoreFromSitemap({
        admin,
        storeId: store.id,
        connectorConfig: store.connector_config,
        urls,
        runStartedAt,
        fullSync,
      });

      const stats: Record<string, unknown> = {
        sitemapUrls: n,
        capped: wasCapped,
        storeId: store.id,
        processed: syncResult.processed,
        upserted: syncResult.upserted,
        variantsUpserted: syncResult.variantsUpserted,
        extractFailed: syncResult.extractFailed,
        noProductFound: syncResult.noProductFound,
        deactivated: syncResult.deactivated,
        extractErrorCodes:
          syncResult.extractErrorCodes?.length > 0
            ? syncResult.extractErrorCodes
            : undefined,
      };

      await admin
        .from('store_catalog_runs')
        .update({
          status: 'succeeded',
          finished_at: new Date().toISOString(),
          stats,
        })
        .eq('id', runId);

      console.info(
        `[store-catalog] store_id=${store.id} safeHost=${safeHost} urls=${n} processed=${syncResult.processed} upserted=${syncResult.upserted} variants=${syncResult.variantsUpserted} extractFailed=${syncResult.extractFailed} noProductFound=${syncResult.noProductFound} deactivated=${syncResult.deactivated} extractErrorCodes=${syncResult.extractErrorCodes?.length ? syncResult.extractErrorCodes.join(',') : '—'} status=succeeded`,
      );
      succeeded++;
    } catch (err) {
      const errorSummary =
        err instanceof Error ? err.message.slice(0, 128) : 'UNKNOWN_ERROR';
      await admin
        .from('store_catalog_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_summary: errorSummary,
        })
        .eq('id', runId);

      console.warn(
        `[store-catalog] store_id=${store.id} safeHost=${safeHost} urlsCount=0 capped=false status=failed error_summary=${errorSummary}`,
      );
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    storesProcessed: activeStores.length,
    succeeded,
    failed,
  });
}
