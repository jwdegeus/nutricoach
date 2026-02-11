'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';

export type StoreForAdmin = {
  id: string;
  name: string;
  base_url: string;
  sitemap_url: string | null;
  is_active: boolean;
  connector_config: {
    rateLimitRps?: number;
    detailBatchSize?: number;
    detailConcurrency?: number;
  } | null;
  created_at: string;
  updated_at: string;
};

export type StoreTemplate = {
  id: string;
  name: string;
  base_url: string;
  sitemap_url: string | null;
  connector_type: 'sitemap_xml' | 'api';
  connector_config: Record<string, unknown>;
};

export type CreateStoreResult =
  | { ok: true; id: string }
  | { ok: false; error: string };
export type UpdateStoreResult = { ok: true } | { ok: false; error: string };
export type TriggerSyncResult =
  | { ok: true; storesProcessed: number; succeeded: number; failed: number }
  | { ok: false; error: string };
export type ListStoreTemplatesResult =
  | { ok: true; data: StoreTemplate[] }
  | { ok: false; error: string };
export type AddStoreFromTemplateResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function isValidHttpsUrl(value: string | null | undefined): boolean {
  if (value === null || value === undefined || typeof value !== 'string')
    return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function createStoreAction(form: {
  name: string;
  base_url: string;
  sitemap_url?: string | null;
  is_active: boolean;
  rateLimitRps?: number | null;
  detailBatchSize?: number | null;
  detailConcurrency?: number | null;
}): Promise<CreateStoreResult> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) return { ok: false, error: 'Geen rechten' };

  const name = form.name?.trim();
  if (!name) return { ok: false, error: 'Naam is verplicht' };
  if (!isValidHttpsUrl(form.base_url))
    return { ok: false, error: 'Base URL moet een geldige https-URL zijn' };
  if (
    form.sitemap_url != null &&
    form.sitemap_url !== '' &&
    !isValidHttpsUrl(form.sitemap_url)
  )
    return { ok: false, error: 'Sitemap URL moet een geldige https-URL zijn' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Niet ingelogd' };

  const connector_config: Record<string, unknown> = {};
  if (typeof form.rateLimitRps === 'number' && form.rateLimitRps > 0)
    connector_config.rateLimitRps = form.rateLimitRps;
  if (typeof form.detailBatchSize === 'number' && form.detailBatchSize > 0)
    connector_config.detailBatchSize = form.detailBatchSize;
  if (typeof form.detailConcurrency === 'number' && form.detailConcurrency > 0)
    connector_config.detailConcurrency = form.detailConcurrency;

  const { data, error } = await supabase
    .from('stores')
    .insert({
      owner_id: user.id,
      name,
      base_url: form.base_url.trim(),
      sitemap_url: form.sitemap_url?.trim() || null,
      is_active: form.is_active,
      connector_config: Object.keys(connector_config).length
        ? connector_config
        : {},
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/**
 * Admin: nieuwe winkel aanmaken in catalogus (store_templates) en toevoegen aan eigen winkellijst (stores).
 */
export async function createStoreTemplateAction(form: {
  name: string;
  base_url: string;
  sitemap_url?: string | null;
  connector_type?: 'sitemap_xml' | 'api';
  rateLimitRps?: number | null;
  detailBatchSize?: number | null;
  detailConcurrency?: number | null;
}): Promise<CreateStoreResult> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) return { ok: false, error: 'Geen rechten' };

  const name = form.name?.trim();
  if (!name) return { ok: false, error: 'Naam is verplicht' };
  if (!isValidHttpsUrl(form.base_url))
    return { ok: false, error: 'Base URL moet een geldige https-URL zijn' };
  if (
    form.sitemap_url != null &&
    form.sitemap_url !== '' &&
    !isValidHttpsUrl(form.sitemap_url)
  )
    return { ok: false, error: 'Sitemap URL moet een geldige https-URL zijn' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Niet ingelogd' };

  const connector_type = form.connector_type ?? 'sitemap_xml';
  const connector_config: Record<string, unknown> = {};
  if (typeof form.rateLimitRps === 'number' && form.rateLimitRps > 0)
    connector_config.rateLimitRps = form.rateLimitRps;
  if (typeof form.detailBatchSize === 'number' && form.detailBatchSize > 0)
    connector_config.detailBatchSize = form.detailBatchSize;
  if (typeof form.detailConcurrency === 'number' && form.detailConcurrency > 0)
    connector_config.detailConcurrency = form.detailConcurrency;

  const { data: templateRow, error: templateErr } = await supabase
    .from('store_templates')
    .insert({
      name,
      base_url: form.base_url.trim(),
      sitemap_url: form.sitemap_url?.trim() || null,
      connector_type,
      connector_config: Object.keys(connector_config).length
        ? connector_config
        : {},
    })
    .select('id')
    .single();

  if (templateErr) return { ok: false, error: templateErr.message };

  const storeConnectorConfig = {
    ...connector_config,
    connectorType: connector_type,
  };
  const { data: storeRow, error: storeErr } = await supabase
    .from('stores')
    .insert({
      owner_id: user.id,
      name,
      base_url: form.base_url.trim(),
      sitemap_url: form.sitemap_url?.trim() || null,
      is_active: true,
      connector_config: storeConnectorConfig,
    })
    .select('id')
    .single();

  if (storeErr) return { ok: false, error: storeErr.message };
  return { ok: true, id: storeRow.id };
}

/**
 * Lijst beschikbare store templates voor "Winkel toevoegen" (lookup).
 * connector_type: 'api' = API-koppeling (bijv. ah.nl), 'sitemap_xml' = sitemap/XML-scraping.
 */
export async function listStoreTemplatesAction(): Promise<ListStoreTemplatesResult> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) return { ok: false, error: 'Geen rechten' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('store_templates')
    .select('id, name, base_url, sitemap_url, connector_type, connector_config')
    .order('name');

  if (error) return { ok: false, error: error.message };
  const list = (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r as { name: string }).name,
    base_url: (r as { base_url: string }).base_url,
    sitemap_url: (r as { sitemap_url: string | null }).sitemap_url,
    connector_type: (r as { connector_type: 'sitemap_xml' | 'api' })
      .connector_type,
    connector_config:
      (r as { connector_config: Record<string, unknown> }).connector_config ??
      {},
  }));
  return { ok: true, data: list };
}

/**
 * Winkel toevoegen vanuit een template (geen handmatig aanmaken).
 * Kopieert template naar stores met owner_id = huidige gebruiker.
 * connector_type komt in connector_config.connectorType voor onderscheid API vs sitemap.
 */
export async function addStoreFromTemplateAction(
  templateId: string,
): Promise<AddStoreFromTemplateResult> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) return { ok: false, error: 'Geen rechten' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Niet ingelogd' };

  const { data: template, error: fetchErr } = await supabase
    .from('store_templates')
    .select('id, name, base_url, sitemap_url, connector_type, connector_config')
    .eq('id', templateId)
    .single();

  if (fetchErr || !template)
    return { ok: false, error: 'Template niet gevonden' };

  const connector_config = {
    ...((template.connector_config as Record<string, unknown>) ?? {}),
    connectorType: template.connector_type,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('stores')
    .insert({
      owner_id: user.id,
      name: template.name,
      base_url: template.base_url,
      sitemap_url: template.sitemap_url ?? null,
      is_active: true,
      connector_config,
    })
    .select('id')
    .single();

  if (insertErr) return { ok: false, error: insertErr.message };
  return { ok: true, id: inserted.id };
}

export async function updateStoreAction(
  id: string,
  form: {
    name?: string;
    base_url?: string;
    sitemap_url?: string | null;
    is_active?: boolean;
    rateLimitRps?: number | null;
    detailBatchSize?: number | null;
    detailConcurrency?: number | null;
    detailDelayMs?: number | null;
  },
): Promise<UpdateStoreResult> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) return { ok: false, error: 'Geen rechten' };

  const updates: Record<string, unknown> = {};
  if (form.name != null) {
    const name = form.name.trim();
    if (!name) return { ok: false, error: 'Naam is verplicht' };
    updates.name = name;
  }
  if (form.base_url != null) {
    if (!isValidHttpsUrl(form.base_url))
      return { ok: false, error: 'Base URL moet een geldige https-URL zijn' };
    updates.base_url = form.base_url.trim();
  }
  if (form.sitemap_url !== undefined) {
    if (
      form.sitemap_url !== null &&
      form.sitemap_url !== '' &&
      !isValidHttpsUrl(form.sitemap_url)
    )
      return {
        ok: false,
        error: 'Sitemap URL moet een geldige https-URL zijn',
      };
    updates.sitemap_url = form.sitemap_url?.trim() || null;
  }
  if (typeof form.is_active === 'boolean') updates.is_active = form.is_active;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('stores')
    .select('connector_config')
    .eq('id', id)
    .single();
  const existingConfig =
    (existing?.connector_config as Record<string, unknown>) ?? {};
  const connector_config = { ...existingConfig };
  if (form.rateLimitRps !== undefined)
    connector_config.rateLimitRps = form.rateLimitRps ?? undefined;
  if (form.detailBatchSize !== undefined)
    connector_config.detailBatchSize = form.detailBatchSize ?? undefined;
  if (form.detailConcurrency !== undefined)
    connector_config.detailConcurrency = form.detailConcurrency ?? undefined;
  if (form.detailDelayMs !== undefined)
    connector_config.detailDelayMs = form.detailDelayMs ?? undefined;
  updates.connector_config = connector_config;

  const { error } = await supabase.from('stores').update(updates).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function toggleStoreActiveAction(
  id: string,
): Promise<UpdateStoreResult> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) return { ok: false, error: 'Geen rechten' };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from('stores')
    .select('is_active')
    .eq('id', id)
    .single();
  if (!row) return { ok: false, error: 'Winkel niet gevonden' };
  const { error } = await supabase
    .from('stores')
    .update({ is_active: !row.is_active })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function triggerSyncAction(): Promise<TriggerSyncResult> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) return { ok: false, error: 'Geen rechten' };

  const secret = process.env.CRON_SECRET;
  if (!secret?.length)
    return {
      ok: false,
      error:
        'CRON_SECRET niet geconfigureerd. Stel in .env of .env.local CRON_SECRET in.',
    };

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  let url = `${base.replace(/\/$/, '')}/api/cron/store-catalog`;
  if (url.includes('localhost')) url = url.replace('localhost', '127.0.0.1');

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'x-cron-secret': secret },
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Sync-endpoint bereiken mislukt: ${msg}. Controleer NEXT_PUBLIC_SITE_URL (nu: ${base}).`,
    };
  }

  const rawText = await res.text();
  let body: Record<string, unknown>;
  try {
    body = (rawText ? JSON.parse(rawText) : {}) as Record<string, unknown>;
  } catch {
    if (res.ok) {
      const preview = rawText.slice(0, 120).replace(/\s+/g, ' ');
      return {
        ok: false,
        error: `Sync mislukt: server gaf HTTP 200 maar geen geldige JSON terug. Controleer CRON_SECRET en NEXT_PUBLIC_SITE_URL.${preview ? ` Antwoord begon met: "${preview}…"` : ''}`,
      };
    }
    return {
      ok: false,
      error: `Sync mislukt (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}). Antwoord was geen JSON.`,
    };
  }

  const bodyError =
    typeof body?.error === 'string'
      ? body.error
      : typeof body?.message === 'string'
        ? body.message
        : typeof body?.reason === 'string'
          ? body.reason
          : typeof body?.detail === 'string'
            ? body.detail
            : null;
  const fallbackError = `Sync mislukt (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''})`;

  if (!res.ok) {
    return { ok: false, error: bodyError ?? fallbackError };
  }
  const ok = body?.ok === true;
  const hasStats =
    typeof body?.storesProcessed === 'number' &&
    typeof body?.succeeded === 'number' &&
    typeof body?.failed === 'number';
  if (!ok && !hasStats) {
    return { ok: false, error: bodyError ?? fallbackError };
  }
  const stats = body as {
    storesProcessed?: number;
    succeeded?: number;
    failed?: number;
  };
  return {
    ok: true,
    storesProcessed: stats.storesProcessed ?? 0,
    succeeded: stats.succeeded ?? 0,
    failed: stats.failed ?? 0,
  };
}

export async function triggerStoreSyncAction(payload: {
  storeId: string;
  full: boolean;
}): Promise<TriggerSyncResult> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) return { ok: false, error: 'Geen rechten' };

  const secret = process.env.CRON_SECRET;
  if (!secret?.length)
    return {
      ok: false,
      error:
        'CRON_SECRET niet geconfigureerd. Stel CRON_SECRET in .env of .env.local in.',
    };

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  let urlBase = `${base.replace(/\/$/, '')}/api/cron/store-catalog`;
  if (urlBase.includes('localhost'))
    urlBase = urlBase.replace('localhost', '127.0.0.1');
  const params = new URLSearchParams({ storeId: payload.storeId });
  if (payload.full) params.set('full', '1');
  const url = `${urlBase}?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'x-cron-secret': secret },
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Sync-endpoint bereiken mislukt: ${msg}. Controleer NEXT_PUBLIC_SITE_URL (nu: ${base}).`,
    };
  }

  const rawText = await res.text();
  let body: Record<string, unknown>;
  try {
    body = (rawText ? JSON.parse(rawText) : {}) as Record<string, unknown>;
  } catch {
    if (res.ok) {
      const preview = rawText.slice(0, 120).replace(/\s+/g, ' ');
      return {
        ok: false,
        error: `Sync mislukt: server gaf HTTP 200 maar geen geldige JSON terug. Controleer CRON_SECRET en NEXT_PUBLIC_SITE_URL.${preview ? ` Antwoord begon met: "${preview}…"` : ''}`,
      };
    }
    return {
      ok: false,
      error: `Sync mislukt (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}). Antwoord was geen JSON.`,
    };
  }

  const bodyError =
    typeof body?.error === 'string'
      ? body.error
      : typeof body?.message === 'string'
        ? body.message
        : typeof body?.reason === 'string'
          ? body.reason
          : typeof body?.detail === 'string'
            ? body.detail
            : null;
  const fallbackError = `Sync mislukt (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''})`;

  if (!res.ok) {
    return { ok: false, error: bodyError ?? fallbackError };
  }
  const ok = body?.ok === true;
  const hasStats =
    typeof body?.storesProcessed === 'number' &&
    typeof body?.succeeded === 'number' &&
    typeof body?.failed === 'number';
  if (!ok && !hasStats) {
    return { ok: false, error: bodyError ?? fallbackError };
  }
  const stats = body as {
    storesProcessed?: number;
    succeeded?: number;
    failed?: number;
  };
  return {
    ok: true,
    storesProcessed: stats.storesProcessed ?? 0,
    succeeded: stats.succeeded ?? 0,
    failed: stats.failed ?? 0,
  };
}
