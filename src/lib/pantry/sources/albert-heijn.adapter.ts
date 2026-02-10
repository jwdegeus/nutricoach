/**
 * Albert Heijn Mobile API adapter
 *
 * Uses anonymous token auth; tokens are cached and refreshed automatically.
 * @see https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md
 *
 * - Anonymous token: POST /mobile-auth/v1/auth/token/anonymous → access_token + refresh_token (expires_in ~7 days)
 * - Refresh: POST /mobile-auth/v1/auth/token/refresh → new tokens
 * - We cache tokens in memory and refresh when expired (buffer 60s before expiry).
 */

import 'server-only';
import { getProductSourceConfigJson } from './product-source-config';
import type {
  ExternalProduct,
  ProductLookupResult,
  ProductSearchResult,
} from './product-source.types';

const DEFAULT_BASE_URL = 'https://api.ah.nl';
const DEFAULT_CLIENT_ID = 'appie-ios';
/** Use token until this many ms before expiry (refresh earlier) */
const REFRESH_BUFFER_MS = 60_000;

/** Required headers for AH API (from doc) */
const STATIC_HEADERS: Record<string, string> = {
  'User-Agent': 'Appie/9.28 (iPhone17,3; iPhone; CPU OS 26_1 like Mac OS X)',
  'x-clientname': 'ipad',
  'x-clientversion': '9.28',
  'x-application': 'AHWEBSHOP',
  'x-accept-language': 'nl-NL',
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

type AhConfig = {
  baseUrl: string;
  clientId: string;
  installationId: string;
};

type CachedToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

/** In-memory cache per config (baseUrl+clientId). Refreshed automatically when expired. */
const tokenCache = new Map<string, CachedToken>();

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function configCacheKey(config: AhConfig): string {
  return `${config.baseUrl}:${config.clientId}`;
}

async function getAhConfig(): Promise<AhConfig> {
  const raw = await getProductSourceConfigJson('albert_heijn');
  const baseUrl =
    (typeof raw?.baseUrl === 'string' && raw.baseUrl.trim()) ||
    DEFAULT_BASE_URL;
  const clientId =
    (typeof raw?.clientId === 'string' && raw.clientId.trim()) ||
    DEFAULT_CLIENT_ID;
  const installationId =
    (typeof raw?.installationId === 'string' && raw.installationId.trim()) ||
    randomUuid();
  return { baseUrl: baseUrl.replace(/\/$/, ''), clientId, installationId };
}

/** Get anonymous access token; returns refresh_token and expires_in for caching. */
async function fetchAnonymousToken(
  config: AhConfig,
): Promise<
  | { accessToken: string; refreshToken: string; expiresIn: number }
  | { error: string }
> {
  const url = `${config.baseUrl}/mobile-auth/v1/auth/token/anonymous`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...STATIC_HEADERS,
      'x-fraud-detection-installation-id': config.installationId,
      'x-correlation-id': randomUuid(),
    },
    body: JSON.stringify({ clientId: config.clientId }),
    next: { revalidate: 0 },
  });

  if (res.status === 429) {
    return { error: 'Te veel verzoeken. Probeer later opnieuw.' };
  }
  if (!res.ok) {
    const text = await res.text();
    return {
      error: `AH auth: ${res.status} ${text.slice(0, 200)}`,
    };
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const accessToken = data?.access_token;
  const refreshToken = data?.refresh_token;
  if (!accessToken) {
    return { error: 'Geen access_token in AH response' };
  }
  const expiresIn =
    typeof data?.expires_in === 'number' ? data.expires_in : 604798;
  return {
    accessToken,
    refreshToken: refreshToken ?? '',
    expiresIn,
  };
}

/** Refresh token; returns new access_token + refresh_token. */
async function fetchRefreshToken(
  config: AhConfig,
  refreshToken: string,
): Promise<
  | { accessToken: string; refreshToken: string; expiresIn: number }
  | { error: string }
> {
  const url = `${config.baseUrl}/mobile-auth/v1/auth/token/refresh`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...STATIC_HEADERS,
      'x-fraud-detection-installation-id': config.installationId,
      'x-correlation-id': randomUuid(),
    },
    body: JSON.stringify({
      clientId: config.clientId,
      refreshToken,
    }),
    next: { revalidate: 0 },
  });

  if (res.status === 429) {
    return { error: 'Te veel verzoeken. Probeer later opnieuw.' };
  }
  if (!res.ok) {
    const text = await res.text();
    return {
      error: `AH refresh: ${res.status} ${text.slice(0, 200)}`,
    };
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const accessToken = data?.access_token;
  const newRefreshToken = data?.refresh_token;
  if (!accessToken) {
    return { error: 'Geen access_token in refresh response' };
  }
  const expiresIn =
    typeof data?.expires_in === 'number' ? data.expires_in : 604798;
  return {
    accessToken,
    refreshToken: newRefreshToken ?? refreshToken,
    expiresIn,
  };
}

function saveToCache(
  key: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): void {
  const expiresAt = Date.now() + expiresIn * 1000 - REFRESH_BUFFER_MS;
  tokenCache.set(key, { accessToken, refreshToken, expiresAt });
}

/**
 * Return a valid access token: from cache if still valid, else refresh if we have refresh_token, else anonymous.
 */
async function getValidToken(
  config: AhConfig,
): Promise<{ accessToken: string } | { error: string }> {
  const key = configCacheKey(config);
  const now = Date.now();
  const cached = tokenCache.get(key);

  if (cached && cached.expiresAt > now) {
    return { accessToken: cached.accessToken };
  }

  if (cached?.refreshToken) {
    const refreshed = await fetchRefreshToken(config, cached.refreshToken);
    if (!('error' in refreshed)) {
      saveToCache(
        key,
        refreshed.accessToken,
        refreshed.refreshToken,
        refreshed.expiresIn,
      );
      return { accessToken: refreshed.accessToken };
    }
  }

  const anonymous = await fetchAnonymousToken(config);
  if ('error' in anonymous) {
    return { error: anonymous.error };
  }
  saveToCache(
    key,
    anonymous.accessToken,
    anonymous.refreshToken,
    anonymous.expiresIn,
  );
  return { accessToken: anonymous.accessToken };
}

type AhSearchProduct = {
  webshopId?: number;
  hqId?: number;
  title?: string;
  salesUnitSize?: string;
  images?: Array<{ width?: number; height?: number; url?: string }>;
  brand?: string;
  nutriscore?: string;
  currentPrice?: number;
  mainCategory?: string;
  subCategory?: string;
};

function mapNutriscore(
  grade: string | undefined,
): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  if (!grade || grade.length !== 1) return null;
  const upper = grade.toUpperCase();
  if (['A', 'B', 'C', 'D', 'E'].includes(upper))
    return upper as 'A' | 'B' | 'C' | 'D' | 'E';
  return null;
}

const AH_PRODUCT_BASE = 'https://www.ah.nl/producten/product';

/** Prefix for synthetic barcode when AH search does not return EAN (so we can still add to pantry) */
const AH_WEBSHOP_ID_PREFIX = 'ah_wi';

function mapAhProductToExternal(
  p: AhSearchProduct,
  barcodeQuery: string | null,
): ExternalProduct {
  const name = (p.title ?? '').trim() || 'Onbekend product';
  const imageUrl = p.images?.[0]?.url?.trim() || null;
  const webshopId = p.webshopId;
  const productUrl =
    webshopId != null ? `${AH_PRODUCT_BASE}/wi${webshopId}` : null;
  const barcode =
    barcodeQuery?.trim() ||
    (webshopId != null ? `${AH_WEBSHOP_ID_PREFIX}${webshopId}` : null);
  return {
    source: 'albert_heijn',
    barcode,
    name,
    brand: (p.brand ?? '').trim(),
    nutriscoreGrade: mapNutriscore(p.nutriscore ?? undefined),
    imageUrl: imageUrl || null,
    quantity: (p.salesUnitSize ?? '').trim() || null,
    productUrl,
  };
}

/**
 * Fetch product by barcode: uses product search with barcode as query and returns first hit.
 * Note: AH's search/v2 API is text-oriented; a query that is only digits (EAN) often returns
 * no results. So for many barcodes we get not_found and the app falls back to Open Food Facts.
 */
export async function getAlbertHeijnProductByBarcode(
  barcode: string,
): Promise<ProductLookupResult> {
  const trimmed = barcode.replace(/\s/g, '');
  if (!trimmed) {
    return { found: false, reason: 'error', message: 'Lege barcode' };
  }

  const config = await getAhConfig();
  const tokenResult = await getValidToken(config);
  if ('error' in tokenResult) {
    return {
      found: false,
      reason: 'error',
      message: tokenResult.error,
    };
  }

  const url = `${config.baseUrl}/mobile-services/product/search/v2?query=${encodeURIComponent(trimmed)}&page=0&size=5&sortOn=RELEVANCE`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...STATIC_HEADERS,
      'x-fraud-detection-installation-id': config.installationId,
      'x-correlation-id': randomUuid(),
      Authorization: `Bearer ${tokenResult.accessToken}`,
    },
    next: { revalidate: 60 },
  });

  if (res.status === 429) {
    return {
      found: false,
      reason: 'rate_limited',
      message: 'Te veel verzoeken. Probeer later opnieuw.',
    };
  }
  if (!res.ok) {
    return {
      found: false,
      reason: 'error',
      message: `AH search: ${res.status}`,
    };
  }

  const data = (await res.json()) as {
    products?: AhSearchProduct[];
    page?: { totalElements?: number };
  };
  const products = data?.products ?? [];
  const first = products[0];
  if (!first) {
    return { found: false, reason: 'not_found' };
  }

  return {
    found: true,
    product: mapAhProductToExternal(first, trimmed),
  };
}

/**
 * Search Albert Heijn products by query.
 */
export async function searchAlbertHeijnProducts(
  query: string,
  limit = 10,
): Promise<ProductSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: true, products: [] };
  }

  const config = await getAhConfig();
  const tokenResult = await getValidToken(config);
  if ('error' in tokenResult) {
    return { ok: false, reason: 'error', message: tokenResult.error };
  }

  const size = Math.min(Math.max(limit, 1), 30);
  const url = `${config.baseUrl}/mobile-services/product/search/v2?query=${encodeURIComponent(trimmed)}&page=0&size=${size}&sortOn=RELEVANCE`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...STATIC_HEADERS,
      'x-fraud-detection-installation-id': config.installationId,
      'x-correlation-id': randomUuid(),
      Authorization: `Bearer ${tokenResult.accessToken}`,
    },
    next: { revalidate: 30 },
  });

  if (res.status === 429) {
    return {
      ok: false,
      reason: 'rate_limited',
      message: 'Te veel zoekverzoeken. Probeer later opnieuw.',
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: 'error',
      message: `AH search: ${res.status}`,
    };
  }

  const data = (await res.json()) as {
    products?: AhSearchProduct[];
  };
  const products = (data?.products ?? []).map((p) =>
    mapAhProductToExternal(p, null),
  );
  return { ok: true, products };
}

/**
 * Test AH API: anonymous token + one search. For admin "Test verbinding".
 */
export async function testAlbertHeijnConnection(): Promise<
  { ok: true; message?: string } | { ok: false; error: string }
> {
  try {
    const config = await getAhConfig();
    const tokenResult = await getValidToken(config);
    if ('error' in tokenResult) {
      return { ok: false, error: tokenResult.error };
    }
    const searchResult = await searchAlbertHeijnProducts('melk', 1);
    if (!searchResult.ok) {
      return {
        ok: false,
        error: searchResult.message ?? searchResult.reason ?? 'Zoeken mislukt',
      };
    }
    const count = searchResult.products.length;
    return {
      ok: true,
      message:
        count > 0
          ? `Verbonden. Zoektest "melk": ${count} resultaat.`
          : 'Verbonden. Zoektest "melk": geen resultaten (API werkt wel).',
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Onbekende fout',
    };
  }
}
