/**
 * Universal product-detail extractor: JSON-LD-first, fetch guardrails, typed errors.
 * No HTML-specific parsers; caller logs host + code. Server-only.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 1.5 * 1024 * 1024;

/** Browser-like User-Agent to reduce bot blocking (e.g. Ekoplaza). */
const FETCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type StoreProductVariantExtract = {
  variantKey: string;
  title?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  sku?: string | null;
  gtin?: string | null;
  isActive?: boolean | null;
};

export type StoreProductExtract = {
  externalKey: string;
  productUrl: string;
  title: string;
  imageUrl?: string | null;
  brand?: string | null;
  categoryPath?: string | null;
  currency?: string | null;
  priceCents?: number | null;
  availability?: string | null;
  unitLabel?: string | null;
  sku?: string | null;
  gtin?: string | null;
  variants?: StoreProductVariantExtract[] | null;
  rawSource?: Record<string, unknown> | null;
};

export type StoreCatalogExtractErrorCode =
  | 'FETCH_FAILED'
  | 'NOT_HTML'
  | 'TOO_LARGE'
  | 'PARSE_FAILED'
  | 'NO_PRODUCT_FOUND';

export class StoreCatalogExtractError extends Error {
  code: StoreCatalogExtractErrorCode;
  status?: number;
  /** Hint for network-level failures (e.g. 'timeout', 'network') when no HTTP status. */
  hint?: string;

  constructor(
    code: StoreCatalogExtractErrorCode,
    message: string,
    status?: number,
    hint?: string,
  ) {
    super(message);
    this.name = 'StoreCatalogExtractError';
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

export type ExtractProductFromUrlOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
};

/**
 * Canonical URL: origin + pathname (no search/hash).
 */
function canonicalizeUrl(url: string): string {
  const u = new URL(url);
  return u.origin + u.pathname;
}

/**
 * Fetch HTML with timeout, max redirects, and streaming byte cap.
 * Throws StoreCatalogExtractError with FETCH_FAILED, NOT_HTML, or TOO_LARGE.
 */
async function fetchHtml(
  productUrl: string,
  opts: { timeoutMs: number; maxRedirects: number; maxBytes: number },
): Promise<{ html: string; finalUrl: string }> {
  const { timeoutMs, maxRedirects, maxBytes } = opts;
  let currentUrl = productUrl;
  let redirectCount = 0;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let origin: string;
    try {
      origin = new URL(currentUrl).origin;
    } catch {
      throw new StoreCatalogExtractError(
        'FETCH_FAILED',
        'Invalid URL',
        undefined,
        'invalid_url',
      );
    }
    const res = await fetch(currentUrl, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept:
          'text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': FETCH_USER_AGENT,
        Referer: `${origin}/`,
      },
    });
    clearTimeout(timeoutId);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')?.trim();
      if (!location || redirectCount >= maxRedirects) {
        throw new StoreCatalogExtractError(
          'FETCH_FAILED',
          'Too many redirects or missing location',
          res.status,
        );
      }
      redirectCount++;
      try {
        currentUrl = new URL(location, currentUrl).href;
      } catch {
        throw new StoreCatalogExtractError(
          'FETCH_FAILED',
          'Invalid redirect location',
          res.status,
        );
      }
      continue;
    }

    if (!res.ok) {
      throw new StoreCatalogExtractError(
        'FETCH_FAILED',
        'Request failed',
        res.status,
      );
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      throw new StoreCatalogExtractError(
        'NOT_HTML',
        'Response is not HTML',
        res.status,
      );
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new StoreCatalogExtractError('FETCH_FAILED', 'No response body');
    }

    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.length > 0) {
          chunks.push(value);
          totalLength += value.length;
          if (totalLength > maxBytes) {
            await reader.cancel();
            throw new StoreCatalogExtractError(
              'TOO_LARGE',
              'Response exceeds size limit',
            );
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const decoder = new TextDecoder('utf-8', { fatal: false });
    const html = decoder.decode(
      chunks.length === 1 ? chunks[0] : concatUint8Arrays(chunks),
    );
    return { html, finalUrl: currentUrl };
  }
}

function concatUint8Arrays(arr: Uint8Array[]): Uint8Array {
  const total = arr.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arr) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

const JSON_LD_SCRIPT_REGEX =
  /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Find first JSON-LD block that parses and contains a Product (by @type).
 */
function findProductInJsonLd(html: string): {
  product: Record<string, unknown>;
  parseFailed: boolean;
} {
  let parseFailed = false;
  let match: RegExpExecArray | null;
  JSON_LD_SCRIPT_REGEX.lastIndex = 0;

  while ((match = JSON_LD_SCRIPT_REGEX.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      parseFailed = true;
      continue;
    }

    const product = findProductNode(data);
    if (product) return { product, parseFailed };
  }

  return { product: null as unknown as Record<string, unknown>, parseFailed };
}

function isProductType(type: unknown): boolean {
  if (typeof type === 'string') return type.toLowerCase().includes('product');
  if (Array.isArray(type))
    return type.some(
      (t) => typeof t === 'string' && t.toLowerCase().includes('product'),
    );
  return false;
}

function findProductNode(data: unknown): Record<string, unknown> | null {
  if (data === null || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;
  if (isProductType(obj['@type'])) return obj;

  const mainEntity = obj.mainEntity;
  if (mainEntity) {
    const candidates = Array.isArray(mainEntity) ? mainEntity : [mainEntity];
    for (const c of candidates) {
      if (c && typeof c === 'object') {
        const node = findProductNode(c);
        if (node) return node;
      }
    }
    for (const c of candidates) {
      const refId =
        typeof c === 'string'
          ? c
          : c && typeof c === 'object'
            ? (c as { '@id'?: unknown })['@id']
            : null;
      if (typeof refId === 'string' && refId) {
        const graph = obj['@graph'];
        if (Array.isArray(graph)) {
          const norm = (id: string) => (id.startsWith('#') ? id : `#${id}`);
          const want = norm(refId);
          for (const item of graph) {
            if (item && typeof item === 'object') {
              const itemId = (item as Record<string, unknown>)['@id'];
              if (typeof itemId === 'string' && norm(itemId) === want) {
                const node = findProductNode(item);
                if (node) return node;
              }
            }
          }
        }
      }
    }
  }

  const graph = obj['@graph'];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const node = findProductNode(item);
      if (node) return node;
    }
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const node = findProductNode(item);
      if (node) return node;
    }
  }

  return null;
}

function stringOrFirst(arr: unknown): string | null {
  if (typeof arr === 'string') return arr;
  if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string')
    return arr[0];
  return null;
}

function brandString(brand: unknown): string | null {
  if (brand === null || brand === undefined) return null;
  if (typeof brand === 'string') return brand;
  if (typeof brand === 'object' && brand !== null && 'name' in brand) {
    const n = (brand as { name?: unknown }).name;
    return typeof n === 'string' ? n : null;
  }
  return null;
}

function gtinFromProduct(obj: Record<string, unknown>): string | null {
  const g = obj.gtin ?? obj.gtin13 ?? obj.gtin14;
  if (typeof g === 'string') return g;
  return null;
}

/**
 * Parse price string/number to cents. Accepts comma or dot decimal.
 */
function priceToCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return Math.round(value * 100);
    return null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '.').trim();
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? Math.round(num * 100) : null;
}

function availabilityString(offerOrOffers: unknown): string | null {
  const o = Array.isArray(offerOrOffers) ? offerOrOffers[0] : offerOrOffers;
  if (o === null || typeof o !== 'object') return null;
  const rec = o as Record<string, unknown>;
  const a = rec.availability;
  if (typeof a === 'string') return a;
  if (typeof a === 'object' && a !== null && '@id' in a)
    return String((a as { '@id'?: unknown })['@id'] ?? '');
  return null;
}

function mapOffersToVariants(offers: unknown): StoreProductVariantExtract[] {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  return list.map((item, index) => {
    const o =
      item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const sku = typeof o.sku === 'string' ? o.sku : null;
    const gtin = typeof o.gtin === 'string' ? o.gtin : null;
    const variantKey = sku ?? gtin ?? String(index);
    const priceCents = priceToCents(o.price);
    const currency =
      typeof o.priceCurrency === 'string' ? o.priceCurrency : null;
    return {
      variantKey,
      title: typeof o.name === 'string' ? o.name : null,
      priceCents: priceCents ?? null,
      currency,
      sku,
      gtin,
      isActive: true,
    };
  });
}

function productToExtract(
  product: Record<string, unknown>,
  productUrl: string,
  finalUrl: string,
): StoreProductExtract {
  const offers = product.offers;
  const singleOffer = Array.isArray(offers) ? offers[0] : offers;
  const offerObj =
    singleOffer && typeof singleOffer === 'object'
      ? (singleOffer as Record<string, unknown>)
      : null;

  const priceCents = offerObj ? priceToCents(offerObj.price) : null;
  const currency =
    offerObj && typeof offerObj.priceCurrency === 'string'
      ? offerObj.priceCurrency
      : null;

  const name = product.name;
  const title = typeof name === 'string' ? name : '';

  const variants = mapOffersToVariants(offers);
  const rawSource: Record<string, unknown> = {
    extractedFrom: 'jsonld',
    offersCount: Array.isArray(offers) ? offers.length : offers ? 1 : 0,
  };

  return {
    externalKey: canonicalizeUrl(finalUrl),
    productUrl: finalUrl,
    title,
    imageUrl: stringOrFirst(product.image) ?? null,
    brand: brandString(product.brand) ?? null,
    categoryPath:
      typeof product.category === 'string' ? product.category : null,
    currency,
    priceCents,
    availability: availabilityString(singleOffer ?? offers) ?? null,
    unitLabel: null,
    sku: typeof product.sku === 'string' ? product.sku : null,
    gtin: gtinFromProduct(product) ?? null,
    variants: variants.length > 0 ? variants : null,
    rawSource,
  };
}

/**
 * Fetch product page HTML and extract product from JSON-LD (schema.org Product).
 * Throws StoreCatalogExtractError on fetch/parse failure or when no Product is found.
 */
export async function extractProductFromUrl(
  productUrl: string,
  opts?: ExtractProductFromUrlOptions,
): Promise<StoreProductExtract> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts?.maxRedirects ?? MAX_REDIRECTS;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;

  let html: string;
  let finalUrl: string;

  try {
    const result = await fetchHtml(productUrl, {
      timeoutMs,
      maxRedirects,
      maxBytes,
    });
    html = result.html;
    finalUrl = result.finalUrl;
  } catch (err) {
    if (err instanceof StoreCatalogExtractError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    let hint: string;
    if (/abort|timeout|ETIMEDOUT|timed out/i.test(msg)) {
      hint = 'timeout';
    } else if (
      /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|socket hang up|connection reset|unable to connect|network/i.test(
        msg,
      )
    ) {
      hint = 'network';
    } else if (/certificate|SSL|TLS|CERT_/i.test(msg)) {
      hint = 'ssl';
    } else {
      const sanitized = msg
        .replace(/https?:\/\/[^\s]+/g, '[url]')
        .slice(0, 50)
        .trim();
      hint = sanitized ? `err:${sanitized}` : 'error';
    }
    throw new StoreCatalogExtractError('FETCH_FAILED', msg, undefined, hint);
  }

  const { product, parseFailed } = findProductInJsonLd(html);

  if (!product || Object.keys(product).length === 0) {
    if (parseFailed) {
      throw new StoreCatalogExtractError(
        'PARSE_FAILED',
        'Invalid JSON-LD in page',
      );
    }
    throw new StoreCatalogExtractError(
      'NO_PRODUCT_FOUND',
      'No Product JSON-LD found',
    );
  }

  return productToExtract(product, productUrl, finalUrl);
}
