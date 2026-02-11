/**
 * Sitemap harvester: fetch sitemap(s), parse XML, return URL list + lastmod.
 * Supports sitemap index (child sitemaps fetched sequentially with rate limit) and urlset.
 * No full URLs in logs; server-only.
 */

import { gunzipSync } from 'node:zlib';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const DEFAULT_RATE_LIMIT_RPS = 2;
const URL_CAP = 50_000;

export type SitemapUrl = { loc: string; lastmod?: string };

export type HarvestSitemapOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  rateLimitRps?: number;
  urlCap?: number;
};

export type HarvestSitemapResult = {
  urls: SitemapUrl[];
  wasCapped: boolean;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout and optional max redirects.
 * Returns response and body as string (decompressed if gzip).
 */
async function fetchSitemap(
  url: string,
  opts: { timeoutMs: number; maxRedirects: number },
): Promise<{ body: string; finalUrl: string }> {
  const { timeoutMs, maxRedirects } = opts;
  let currentUrl = url;
  let redirectCount = 0;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(currentUrl, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/xml, text/xml, */*',
        'Accept-Encoding': 'identity',
      },
    });
    clearTimeout(timeoutId);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location || redirectCount >= maxRedirects) {
        throw new Error(
          redirectCount >= maxRedirects ? 'MAX_REDIRECTS' : 'MISSING_LOCATION',
        );
      }
      redirectCount++;
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    if (!res.ok) {
      throw new Error(`HTTP_${res.status}`);
    }

    const contentEncoding = res.headers.get('content-encoding') ?? '';
    const isGzip =
      contentEncoding === 'gzip' ||
      url.endsWith('.gz') ||
      currentUrl.endsWith('.gz');

    const buf = Buffer.from(await res.arrayBuffer());
    let body: string;

    if (isGzip) {
      try {
        body = gunzipSync(buf).toString('utf-8');
      } catch {
        // Some servers send Content-Encoding: gzip but body is plain, or runtime already decompressed.
        const asUtf8 = buf.toString('utf-8');
        if (/<\?xml\s|<\/?(?:urlset|sitemapindex)\b/i.test(asUtf8)) {
          body = asUtf8;
        } else {
          throw new Error('SITEMAP_GZ_UNSUPPORTED');
        }
      }
    } else {
      body = buf.toString('utf-8');
    }

    return { body, finalUrl: currentUrl };
  }
}

/** Unwrap <![CDATA[...]]> if present, otherwise return trimmed value. */
function unwrapCdata(value: string): string {
  const t = value.trim();
  if (t.startsWith('![CDATA[') && t.endsWith(']]')) {
    return t.slice(8, -2).trim();
  }
  return t;
}

/**
 * Validate and normalize a sitemap URL. Resolves relative URLs against base.
 * Removes internal whitespace (e.g. newlines) that can cause "Invalid URL".
 * Returns null if invalid.
 */
function normalizeLoc(loc: string, baseUrl: string): string | null {
  const trimmed = loc.trim().replace(/\s+/g, '');
  if (!trimmed) return null;
  try {
    const u =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? new URL(trimmed)
        : new URL(trimmed, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Extract <loc> and optional <lastmod> from urlset <url> entries.
 * Handles <loc><![CDATA[https://...]]></loc> (e.g. Ekoplaza).
 * Normalizes and validates URLs; skips invalid ones.
 */
function parseUrlset(
  xml: string,
  urlCap: number,
  baseUrl: string,
): { urls: SitemapUrl[]; capped: boolean } {
  const urls: SitemapUrl[] = [];
  const urlBlockRegex = /<url\b[^>]*>([\s\S]*?)<\/url>/gi;
  let m: RegExpExecArray | null;
  while ((m = urlBlockRegex.exec(xml)) !== null && urls.length < urlCap) {
    const block = m[1];
    const locMatch = /<loc\s*>([\s\S]*?)<\/loc>/i.exec(block);
    const locRaw = locMatch ? locMatch[1] : null;
    const loc = locRaw ? unwrapCdata(locRaw) : null;
    if (!loc) continue;
    const normalized = normalizeLoc(loc, baseUrl);
    if (!normalized) continue;
    const lastmodMatch = /<lastmod\s*>([^<]+)<\/lastmod>/i.exec(block);
    const lastmod = lastmodMatch
      ? unwrapCdata(lastmodMatch[1]).trim() || undefined
      : undefined;
    urls.push({ loc: normalized, lastmod });
  }
  return { urls, capped: urls.length >= urlCap };
}

/**
 * Extract <loc> from sitemapindex <sitemap> entries.
 */
function parseSitemapIndex(xml: string): string[] {
  const locs: string[] = [];
  const blockRegex = /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(xml)) !== null) {
    const locMatch = /<loc\s*>([^<]+)<\/loc>/i.exec(m[1]);
    if (locMatch) locs.push(locMatch[1].trim());
  }
  return locs;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex\b/i.test(xml);
}

/**
 * Harvest URLs from a sitemap URL. Supports sitemap index (fetches child sitemaps
 * sequentially with rate limit) and urlset. Caps at urlCap URLs (default 50k).
 */
export async function harvestSitemapUrls(
  sitemapUrl: string,
  opts: HarvestSitemapOptions = {},
): Promise<HarvestSitemapResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const rateLimitRps = opts.rateLimitRps ?? DEFAULT_RATE_LIMIT_RPS;
  const urlCap = opts.urlCap ?? URL_CAP;
  const delayMs = rateLimitRps > 0 ? Math.ceil(1000 / rateLimitRps) : 0;

  const { body, finalUrl } = await fetchSitemap(sitemapUrl, {
    timeoutMs,
    maxRedirects,
  });

  if (isSitemapIndex(body)) {
    const childLocs = parseSitemapIndex(body);
    const allUrls: SitemapUrl[] = [];
    let capped = false;
    for (let i = 0; i < childLocs.length && allUrls.length < urlCap; i++) {
      if (i > 0 && delayMs > 0) await delay(delayMs);
      try {
        const { body: childBody } = await fetchSitemap(childLocs[i], {
          timeoutMs,
          maxRedirects,
        });
        const { urls, capped: childCapped } = parseUrlset(
          childBody,
          urlCap - allUrls.length,
          childLocs[i],
        );
        allUrls.push(...urls);
        if (childCapped || allUrls.length >= urlCap) {
          capped = true;
          break;
        }
      } catch {
        // Skip failed child; continue with others
      }
    }
    return {
      urls: allUrls.slice(0, urlCap),
      wasCapped: capped || allUrls.length >= urlCap,
    };
  }

  const { urls, capped } = parseUrlset(body, urlCap, finalUrl);
  return { urls, wasCapped: capped };
}
