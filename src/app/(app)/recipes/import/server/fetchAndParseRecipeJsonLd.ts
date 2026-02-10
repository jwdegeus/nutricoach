/**
 * Fetch and Parse Recipe from JSON-LD
 *
 * Fetches HTML from a URL, extracts JSON-LD blocks, and parses Recipe schema.org data.
 * Includes SSRF mitigation and security checks.
 */

import 'server-only';
import dns from 'dns';
import { promises as dnsPromises } from 'dns';
import type {
  RecipeDraft,
  RecipeExtractionDiagnostics,
} from '../recipeDraft.types';
import { mergeInstructionsIntoParagraphs } from '../recipeInstructionUtils';

/**
 * Result type for fetch and parse operation
 */
export type FetchAndParseResult =
  | {
      ok: true;
      draft: RecipeDraft;
      diagnostics?: RecipeExtractionDiagnostics;
    }
  | {
      ok: false;
      errorCode:
        | 'FETCH_FAILED'
        | 'UNSUPPORTED_CONTENT_TYPE'
        | 'RESPONSE_TOO_LARGE'
        | 'NO_RECIPE_FOUND'
        | 'JSONLD_PARSE_FAILED';
      message: string;
    };

/**
 * Configuration constants
 */
const FETCH_TIMEOUT_MS =
  typeof process !== 'undefined' && process.env.RECIPE_FETCH_TIMEOUT_MS
    ? parseInt(process.env.RECIPE_FETCH_TIMEOUT_MS, 10)
    : 35_000; // 35s standaard; veel receptensites zijn traag (DNS + TTFB)
/** DNS resolution timeout; Node's dns.resolve4 has no built-in timeout and can hang 60s+ */
const DNS_TIMEOUT_MS =
  typeof process !== 'undefined' && process.env.RECIPE_DNS_TIMEOUT_MS
    ? parseInt(process.env.RECIPE_DNS_TIMEOUT_MS, 10)
    : 10_000; // 10s max for DNS so total wait is bounded

// Prefer IPv4 so Node's resolver doesn't hang on IPv6; fetch may still work when our DNS is slow
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const MAX_RESPONSE_SIZE = 3 * 1024 * 1024; // 3MB
/** Stop met body lezen na deze grootte. Verhoogd zodat JSON-LD (vaak in footer bij WordPress/WPRM) niet wordt afgekapt. */
const MAX_BODY_READ_SIZE = 2.5 * 1024 * 1024; // 2.5MB
const MAX_REDIRECTS = 5; // Increased for sites with multiple redirects
const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/html; charset=utf-8',
  'text/html;charset=utf-8',
];

/**
 * Private IP ranges (RFC 1918, loopback, link-local)
 */
const PRIVATE_IP_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' }, // Link-local
  { start: '::1', end: '::1' }, // IPv6 loopback
  { start: 'fc00::', end: 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' }, // IPv6 private
  { start: 'fe80::', end: 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff' }, // IPv6 link-local
];

/**
 * Check if an IP address is in a private range
 */
function isPrivateIP(ip: string): boolean {
  // IPv6 handling
  if (ip.includes(':')) {
    const ipv6 = ip.toLowerCase();
    for (const range of PRIVATE_IP_RANGES) {
      if (range.start.includes(':')) {
        // Simple IPv6 range check (for our use case, exact match for ::1, prefix for others)
        if (ipv6 === range.start || ipv6.startsWith(range.start)) {
          return true;
        }
      }
    }
    return false;
  }

  // IPv4 handling
  const ipParts = ip.split('.').map(Number);
  if (ipParts.length !== 4 || ipParts.some((p) => isNaN(p))) {
    return false;
  }

  for (const range of PRIVATE_IP_RANGES) {
    if (range.start.includes(':')) continue; // Skip IPv6 ranges

    const [start1, start2, start3, start4] = range.start.split('.').map(Number);
    const [end1, end2, end3, end4] = range.end.split('.').map(Number);

    if (
      ipParts[0] >= start1 &&
      ipParts[0] <= end1 &&
      ipParts[1] >= start2 &&
      ipParts[1] <= end2 &&
      ipParts[2] >= start3 &&
      ipParts[2] <= end3 &&
      ipParts[3] >= start4 &&
      ipParts[3] <= end4
    ) {
      return true;
    }
  }

  return false;
}

/** Cache voor goedgekeurde hostnames (SSRF-check al gedaan), TTL 5 min */
const hostnameValidationCache = new Map<string, number>();
const HOSTNAME_CACHE_TTL_MS = 5 * 60 * 1000;

function isHostnameCached(hostname: string): boolean {
  const until = hostnameValidationCache.get(hostname);
  return until != null && Date.now() < until;
}

function cacheHostnameValid(hostname: string): void {
  hostnameValidationCache.set(hostname, Date.now() + HOSTNAME_CACHE_TTL_MS);
}

/**
 * Resolve hostname and check for private IPs (SSRF mitigation).
 * Only IPv4 is resolved (faster; IPv6 check skipped for speed; most recipe sites use IPv4).
 * Result is cached for 5 min.
 */
async function validateHostname(hostname: string): Promise<void> {
  if (isHostnameCached(hostname)) return;

  try {
    const addresses4 = await dnsPromises.resolve4(hostname);
    for (const addr of addresses4) {
      if (isPrivateIP(addr)) {
        throw new Error(`Hostname resolves to private IP: ${addr}`);
      }
    }
    cacheHostnameValid(hostname);
  } catch (error) {
    if (error instanceof Error && error.message.includes('private IP')) {
      throw error;
    }
    // DNS resolution failed - allow it to fail at fetch time
  }
}

/** Run validateHostname with a timeout; Node's dns has no built-in timeout. */
async function validateHostnameWithTimeout(hostname: string): Promise<void> {
  await Promise.race([
    validateHostname(hostname),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `DNS resolution timeout after ${DNS_TIMEOUT_MS}ms. De website is niet bereikbaar.`,
            ),
          ),
        DNS_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Extract hostname from URL
 */
function getHostname(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    throw new Error('Invalid URL format');
  }
}

/**
 * Read response body as stream and stop after maxBytes to avoid long waits on huge pages.
 * Recipe content is usually in the first part of the HTML.
 */
async function readResponseBodyWithLimit(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  const body = response.body;
  if (!body) {
    return response.text();
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      totalBytes += value.length;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const toDecode = concatChunks(chunks, maxBytes);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(toDecode);
}

/** Concatenate Uint8Arrays and take at most maxBytes */
function concatChunks(chunks: Uint8Array[], maxBytes: number): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const size = Math.min(total, maxBytes);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    if (offset >= size) break;
    const take = Math.min(c.length, size - offset);
    out.set(c.subarray(0, take), offset);
    offset += take;
  }
  return out;
}

/**
 * Fetch HTML with security checks
 */
export async function fetchHtml(url: string): Promise<string> {
  const totalStart = Date.now();
  console.log(`[fetchHtml] Starting fetch for URL: ${url}`);

  // Validate URL scheme
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('URL must use http:// or https://');
  }

  // Validate hostname and check for private IPs (SSRF)
  // DNS has no built-in timeout in Node; cap it so we don't wait 60s+.
  // On timeout we proceed with fetch anyway — fetch uses its own resolver and the site may be reachable.
  const hostname = getHostname(url);
  const dnsStart = Date.now();
  try {
    await validateHostnameWithTimeout(hostname);
    const dnsMs = Date.now() - dnsStart;
    console.log(
      `[fetchHtml] DNS validation passed${dnsMs > 0 ? ` in ${dnsMs}ms` : ''}`,
    );
  } catch (error) {
    const isDnsTimeout =
      error instanceof Error &&
      error.message.includes('DNS resolution timeout');
    if (isDnsTimeout) {
      console.warn(
        `[fetchHtml] DNS validation timed out (${hostname}), proceeding with fetch anyway`,
      );
    } else {
      console.error(`[fetchHtml] DNS validation failed:`, error);
      throw error;
    }
  }

  const fetchStart = Date.now();
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let currentUrl = url;
    let redirectCount = 0;

    while (redirectCount <= MAX_REDIRECTS) {
      const currentHostname = getHostname(currentUrl);
      console.log(
        `[fetchHtml] Attempt ${redirectCount + 1}: Fetching ${currentUrl}`,
      );
      // Only re-validate hostname when following a redirect (new hostname). Initial URL was already validated before the loop (or we proceeded on DNS timeout).
      if (redirectCount > 0) {
        try {
          await validateHostnameWithTimeout(currentHostname);
        } catch (error) {
          console.error(
            `[fetchHtml] Hostname validation failed for ${currentHostname}:`,
            error,
          );
          throw error;
        }
      }

      // Use realistic browser headers to avoid bot detection
      // Note: We don't set Accept-Encoding - Node.js fetch handles decompression automatically
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      };
      if (redirectCount > 0) headers.Referer = url;
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'manual', // Handle redirects manually for SSRF checks
      });

      const ttfbMs = Date.now() - fetchStart;
      console.log(
        `[fetchHtml] Response status: ${response.status}, content-type: ${response.headers.get('content-type')}${ttfbMs > 0 ? ` (TTFB ${ttfbMs}ms)` : ''}`,
      );

      // Check content type (more lenient - allow if it contains text/html or is empty)
      const contentType =
        response.headers.get('content-type')?.toLowerCase() || '';
      const isAllowedType = ALLOWED_CONTENT_TYPES.some((allowed) =>
        contentType.includes(allowed),
      );

      // Check for HTTP error status codes (but allow 200-299 and redirects 300-399)
      if (response.status >= 400 && response.status < 500) {
        console.error(`[fetchHtml] Client error: ${response.status}`);
        if (response.status === 403 || response.status === 401) {
          const error = new Error(
            'De website blokkeert toegang tot deze pagina (Access Denied). Probeer een andere URL of controleer of de pagina publiek toegankelijk is.',
          );
          (error as Error & { code?: string }).code = 'ACCESS_DENIED';
          throw error;
        }
        if (response.status === 404) {
          const error = new Error(
            'Pagina niet gevonden (404). Controleer of de URL correct is.',
          );
          (error as Error & { code?: string }).code = 'NOT_FOUND';
          throw error;
        }
        // Other 4xx errors
        const error = new Error(
          `Client error (${response.status}). De website weigert de request.`,
        );
        (error as Error & { code?: string }).code = 'CLIENT_ERROR';
        throw error;
      }

      if (response.status >= 500) {
        const error = new Error(
          `Server error (${response.status}). De website heeft een probleem. Probeer het later opnieuw.`,
        );
        (error as Error & { code?: string }).code = 'SERVER_ERROR';
        throw error;
      }

      // Allow if content-type contains text/html or is empty (some servers don't send it)
      if (
        !isAllowedType &&
        !contentType.includes('text/html') &&
        contentType !== ''
      ) {
        const error = new Error(
          `Unsupported content type: ${contentType}. Expected text/html or application/xhtml+xml`,
        );
        (error as Error & { code?: string }).code = 'UNSUPPORTED_CONTENT_TYPE';
        throw error;
      }

      // Handle redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        console.log(
          `[fetchHtml] Redirect detected: ${response.status} -> ${location}`,
        );
        if (!location) {
          throw new Error('Redirect without Location header');
        }

        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error('Too many redirects');
        }

        // Resolve relative URLs
        currentUrl = new URL(location, currentUrl).href;
        console.log(`[fetchHtml] Following redirect to: ${currentUrl}`);
        continue;
      }

      // Check response size from content-length header (before decompression)
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > MAX_RESPONSE_SIZE) {
          const error = new Error(
            `Response too large: ${size} bytes (max: ${MAX_RESPONSE_SIZE})`,
          );
          (error as Error & { code?: string }).code = 'RESPONSE_TOO_LARGE';
          throw error;
        }
      }

      // Read body as stream and stop after MAX_BODY_READ_SIZE so we don't wait for huge pages
      const bodyStart = Date.now();
      console.log(
        `[fetchHtml] Reading response body (max ${MAX_BODY_READ_SIZE / 1024}KB)...`,
      );
      const html = await readResponseBodyWithLimit(
        response,
        MAX_BODY_READ_SIZE,
        controller.signal,
      );
      const bodyMs = Date.now() - bodyStart;
      console.log(
        `[fetchHtml] Response received, size: ${html.length} bytes${bodyMs > 0 ? ` (body ${bodyMs}ms)` : ''}`,
      );

      // Check actual size after decompression (safety check)
      if (html.length > MAX_RESPONSE_SIZE) {
        const error = new Error(
          `Response too large after decompression: ${html.length} bytes (max: ${MAX_RESPONSE_SIZE})`,
        );
        (error as Error & { code?: string }).code = 'RESPONSE_TOO_LARGE';
        throw error;
      }

      const totalMs = Date.now() - totalStart;
      console.log(
        `[fetchHtml] Fetch successful in ${totalMs}ms total, returning HTML`,
      );
      return html;
    }

    throw new Error('Failed to fetch after redirects');
  } catch (error) {
    console.error(`[fetchHtml] Error occurred:`, error);
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error(`[fetchHtml] Timeout error`);
        const timeoutError = new Error(
          `Fetch timeout after ${FETCH_TIMEOUT_MS}ms. De website reageert te langzaam.`,
        );
        (timeoutError as Error & { code?: string }).code = 'FETCH_TIMEOUT';
        throw timeoutError;
      }
      // Preserve error codes from earlier in the function
      if ((error as Error & { code?: string }).code) {
        console.error(
          `[fetchHtml] Error with code: ${(error as Error & { code?: string }).code}`,
        );
        throw error;
      }
      // Add more context to generic errors
      console.error(`[fetchHtml] Generic error: ${error.message}`);
      throw new Error(
        `Failed to fetch URL: ${error.message}. Controleer of de URL correct is en publiek toegankelijk.`,
      );
    }
    console.error(`[fetchHtml] Unknown error type`);
    throw new Error('Unknown fetch error');
  } finally {
    clearTimeout(timeoutId);
  }
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(
  html: string,
  attrName: 'property' | 'name',
  attrValue: string,
): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]*\\b${attrName}=["']${attrValue}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<meta[^>]*\\bcontent=["']([^"']+)["'][^>]*\\b${attrName}=["']${attrValue}["'][^>]*>`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const match = re.exec(html);
    if (match && match[1]) return match[1].trim();
  }
  return undefined;
}

function extractOgImageUrl(
  html: string,
  sourceUrl: string,
): {
  imageUrl?: string;
  source: 'og:image' | 'og:image:url' | 'twitter:image' | null;
} {
  const candidates: {
    attrName: 'property' | 'name';
    attrValue: 'og:image' | 'og:image:url' | 'twitter:image';
  }[] = [
    { attrName: 'property', attrValue: 'og:image' },
    { attrName: 'property', attrValue: 'og:image:url' },
    { attrName: 'name', attrValue: 'twitter:image' },
  ];

  for (const candidate of candidates) {
    const content = extractMetaContent(
      html,
      candidate.attrName,
      candidate.attrValue,
    );
    if (!content) continue;
    try {
      let resolved: string;
      if (content.startsWith('//')) {
        resolved = `https:${content}`;
      } else {
        resolved = new URL(content, sourceUrl).toString();
      }
      return { imageUrl: resolved, source: candidate.attrValue };
    } catch {
      continue;
    }
  }

  return { imageUrl: undefined, source: null };
}

/**
 * Heuristic: extract ingredients/instructions from headings + lists in plain HTML.
 * Looks for h2/h3/h4 headings containing "Ingredients" or "Instructions"
 * and grabs the first <ul>/<ol> list that follows.
 */
export function extractRecipeFromHtmlHeadings(
  html: string,
  sourceUrl: string,
): {
  title?: string;
  ingredients: string[];
  instructions: string[];
  imageUrl?: string;
} | null {
  const titleMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = titleMatch ? stripHtml(titleMatch[1]) : undefined;

  const INGREDIENT_HEADING_TOKENS = [
    'ingredients',
    'what you need',
    'components',
  ];
  const INSTRUCTION_HEADING_TOKENS = [
    'instructions',
    'directions',
    'method',
    'preparation',
    'steps',
    'bereiding',
    'bereidingswijze',
    'instructies',
    'stappen',
  ];

  const normalizeHeading = (raw: string): string =>
    raw
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[\s:–-]+$/g, '')
      .trim();

  const matchHeadingToken = (
    headingText: string,
    tokens: string[],
  ): string | null => {
    for (const token of tokens) {
      if (headingText.includes(token)) return token;
    }
    return null;
  };

  const findListAfterHeading = (
    headingTokens: string[],
    maxDistance: number = 8000,
  ): { items: string[]; matchedToken: string | null } => {
    const headingRegex = /<h[234][^>]*>([\s\S]*?)<\/h[234]\s*>/gi;
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(html)) !== null) {
      const headingText = normalizeHeading(stripHtml(match[1]));
      const matchedToken = matchHeadingToken(headingText, headingTokens);
      if (!matchedToken) continue;
      const afterHeading = html.slice(
        match.index + match[0].length,
        match.index + match[0].length + maxDistance,
      );
      const listMatch = /<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i.exec(afterHeading);
      if (!listMatch || !listMatch[2]) continue;
      const liBlocks = listMatch[2].match(/<li[^>]*>[\s\S]*?<\/li>/gi);
      if (!liBlocks || liBlocks.length === 0) continue;
      const items = liBlocks
        .map((li) => stripHtml(li))
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      if (items.length > 0) return { items, matchedToken };
    }
    return { items: [], matchedToken: null };
  };

  const ingredientsResult = findListAfterHeading(INGREDIENT_HEADING_TOKENS);
  const instructionsResult = findListAfterHeading(INSTRUCTION_HEADING_TOKENS);
  const ingredients = ingredientsResult.items;
  const instructions = instructionsResult.items;

  if (ingredients.length < 3 || instructions.length < 2) {
    return null;
  }

  const ogImage = extractOgImageUrl(html, sourceUrl);

  const debugEnabled =
    typeof process !== 'undefined' &&
    process.env.RECIPE_IMPORT_DEBUG === 'true';
  if (debugEnabled) {
    console.log(
      '[extractRecipeFromHtmlHeadings] heading match',
      JSON.stringify({
        ingredientHeadingMatched: ingredientsResult.matchedToken,
        instructionHeadingMatched: instructionsResult.matchedToken,
        ogImageFound: !!ogImage.imageUrl,
        ogImageSource: ogImage.source,
      }),
    );
  }

  return {
    title,
    ingredients,
    instructions,
    imageUrl: ogImage.imageUrl,
  };
}

/**
 * Extract ingredient section headings and counts from HTML (for JSON-LD imports that have flat ingredients).
 * Looks for WP Recipe Maker (.wprm-recipe-ingredient-group) or generic h3/h4 + ul.
 */
export function extractIngredientSectionsFromHtml(
  html: string,
): { section: string; count: number }[] {
  const sections: { section: string; count: number }[] = [];

  // WP Recipe Maker: group-name (any tag) then ul.wprm-recipe-ingredients; name may contain inner HTML (e.g. <strong>)
  const wprmNameThenList =
    /<[^>]*class="[^"]*wprm-recipe-ingredient-group-name[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>[\s\S]*?<ul[^>]*class="[^"]*wprm-recipe-ingredients[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi;
  let m: RegExpExecArray | null;
  while ((m = wprmNameThenList.exec(html)) !== null) {
    const name = stripHtml(m[1]);
    const listContent = m[2];
    const liCount = (listContent.match(/<li[^>]*>/gi) || []).length;
    if (name && liCount > 0) sections.push({ section: name, count: liCount });
  }
  if (sections.length > 0) return sections;

  // WPRM: div.wprm-recipe-ingredient-group containing heading + ul (order may vary)
  const wprmGroupRegex =
    /<[^>]*class="[^"]*wprm-recipe-ingredient-group[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*wprm-recipe-ingredient-group-name[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>[\s\S]*?<ul[^>]*class="[^"]*wprm-recipe-ingredients[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi;
  while ((m = wprmGroupRegex.exec(html)) !== null) {
    const name = stripHtml(m[1]);
    const liCount = (m[2].match(/<li[^>]*>/gi) || []).length;
    if (name && liCount > 0) sections.push({ section: name, count: liCount });
  }
  if (sections.length > 0) return sections;

  // WPRM fallback: div with wprm-recipe-ingredient-group, then first h3/h4 (text) and first ul (count li)
  const wprmDivRegex =
    /<div[^>]*class="[^"]*wprm-recipe-ingredient-group[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*wprm-recipe-ingredient-group"|$)/gi;
  while ((m = wprmDivRegex.exec(html)) !== null) {
    const block = m[1];
    const headMatch = /<h[34][^>]*>([\s\S]*?)<\/h[34]\s*>/i.exec(block);
    const ulMatch = /<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(block);
    if (headMatch && ulMatch) {
      const name = stripHtml(headMatch[1]);
      const liCount = (ulMatch[1].match(/<li[^>]*>/gi) || []).length;
      if (name && liCount > 0) sections.push({ section: name, count: liCount });
    }
  }
  if (sections.length > 0) return sections;

  // Generic: h3 or h4 followed by first ul (within ~2k chars)
  const headingRegex = /<h[34][^>]*>([\s\S]*?)<\/h[34]\s*>/gi;
  while ((m = headingRegex.exec(html)) !== null) {
    const name = stripHtml(m[1]);
    const afterHeading = html.slice(
      m.index + m[0].length,
      m.index + m[0].length + 2000,
    );
    const ulMatch = /<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(afterHeading);
    if (ulMatch) {
      const liCount = (ulMatch[1].match(/<li[^>]*>/gi) || []).length;
      if (name && liCount > 0) sections.push({ section: name, count: liCount });
    }
  }

  return sections;
}

/**
 * Extract instruction steps from HTML (fallback when JSON-LD recipeInstructions are missing or truncated).
 * Prefer full <li> content (title + body); avoid .wprm-recipe-instruction-text alone as it often contains only the step title.
 */
export function extractInstructionsFromHtml(html: string): { text: string }[] {
  const steps: { text: string }[] = [];
  let m: RegExpExecArray | null;

  // 1) WPRM: full <li> with wprm-recipe-instruction (gets title + body; instruction-text span often has only title)
  const liRegex =
    /<li[^>]*class="[^"]*wprm-recipe-instruction[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  while ((m = liRegex.exec(html)) !== null) {
    const t = stripHtml(m[1]);
    if (t.length > 5) steps.push({ text: t });
  }
  if (steps.length > 0) return steps;

  // 2) WPRM: inside instructions container, first ol/ul – full li content (title + body)
  const instructionsContainerRegex =
    /<[^>]*class="[^"]*wprm-recipe-instructions(?!-ingredients)[^"]*"[^>]*>[\s\S]*?<(ol|ul)[^>]*>([\s\S]*?)<\/\1>/i;
  const containerMatch = html.match(instructionsContainerRegex);
  if (containerMatch && containerMatch[2]) {
    const listHtml = containerMatch[2];
    const liBlocks = listHtml.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    if (liBlocks && liBlocks.length >= 2) {
      for (const li of liBlocks) {
        const contentMatch = li.match(/<li[^>]*>([\s\S]*?)<\/li>/i);
        const t = contentMatch ? stripHtml(contentMatch[1]) : stripHtml(li);
        if (t.length > 5) steps.push({ text: t });
      }
      if (steps.length > 0) return steps;
    }
  }

  // 3) Generic: after "Instructions" / "Bereiding" heading, first ol/ul – full li content
  const afterInstructionsHeading = html.match(
    /(?:Instructions|Bereiding|Directions|Instructies)[\s\S]{0,200}?<(ol|ul)[^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (afterInstructionsHeading && afterInstructionsHeading[2]) {
    const listHtml = afterInstructionsHeading[2];
    const liBlocks = listHtml.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    if (liBlocks && liBlocks.length >= 2) {
      for (const li of liBlocks) {
        const contentMatch = li.match(/<li[^>]*>([\s\S]*?)<\/li>/i);
        const t = contentMatch ? stripHtml(contentMatch[1]) : stripHtml(li);
        if (t.length > 5) steps.push({ text: t });
      }
      if (steps.length > 0) return steps;
    }
  }

  // 4) WPRM: div.wprm-recipe-instruction (full div content)
  const divRegex =
    /<div[^>]*class="[^"]*wprm-recipe-instruction[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  while ((m = divRegex.exec(html)) !== null) {
    const t = stripHtml(m[1]);
    if (t.length > 5) steps.push({ text: t });
  }
  if (steps.length > 0) return steps;

  // 5) Last resort: .wprm-recipe-instruction-text (can be title-only; use only if nothing else gave full steps)
  const textRegex =
    /<[^>]*class="[^"]*wprm-recipe-instruction-text[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
  while ((m = textRegex.exec(html)) !== null) {
    const t = stripHtml(m[1]);
    if (t.length > 5) steps.push({ text: t });
  }

  return steps;
}

/**
 * Assign section to each ingredient by index using (section, count) pairs.
 * If total from sections does not match ingredient count, still assigns by position (extra ingredients get null section).
 */
export function assignSectionsToIngredients<
  T extends { section?: string | null },
>(
  ingredients: T[],
  sectionsWithCounts: { section: string; count: number }[],
): T[] {
  if (sectionsWithCounts.length === 0) return ingredients;

  let sectionIdx = 0;
  let remainingInSection = sectionsWithCounts[0]?.count ?? 0;
  return ingredients.map((ing) => {
    if (remainingInSection <= 0 && sectionIdx + 1 < sectionsWithCounts.length) {
      sectionIdx++;
      remainingInSection = sectionsWithCounts[sectionIdx].count;
    }
    const section =
      remainingInSection > 0
        ? (sectionsWithCounts[sectionIdx]?.section ?? null)
        : null;
    if (remainingInSection > 0) remainingInSection--;
    return { ...ing, section };
  });
}

/**
 * Extract all JSON-LD blocks from HTML
 */
function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];

  // More flexible regex that handles:
  // - Single or double quotes
  // - Whitespace around type attribute
  // - Case-insensitive type matching
  // - Optional charset or other attributes
  const regex =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = regex.exec(html)) !== null) {
    let jsonContent = match[1].trim();

    // Remove HTML comments if present
    jsonContent = jsonContent.replace(/<!--[\s\S]*?-->/g, '');

    // Decode HTML entities (basic ones)
    jsonContent = jsonContent
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    if (jsonContent) {
      blocks.push(jsonContent);
    }
  }

  return blocks;
}

/**
 * Check if an object is a Recipe type (case-insensitive)
 */
function isRecipeType(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;

  const type = (obj as Record<string, unknown>)['@type'];
  if (!type) return false;

  // Handle string
  if (typeof type === 'string') {
    return type.toLowerCase() === 'recipe';
  }

  // Handle array
  if (Array.isArray(type)) {
    return type.some(
      (t) => typeof t === 'string' && t.toLowerCase() === 'recipe',
    );
  }

  return false;
}

/**
 * Find all Recipe objects in JSON-LD data
 */
function findRecipes(data: unknown): Record<string, unknown>[] {
  const recipes: Record<string, unknown>[] = [];

  // Handle array
  if (Array.isArray(data)) {
    for (const item of data) {
      recipes.push(...findRecipes(item));
    }
    return recipes;
  }

  // Handle object
  if (data && typeof data === 'object') {
    const dataObj = data as Record<string, unknown>;
    // Check @graph (common in JSON-LD)
    if (Array.isArray(dataObj['@graph'])) {
      for (const item of dataObj['@graph'] as unknown[]) {
        recipes.push(...findRecipes(item));
      }
    }

    // Check if this object is a Recipe
    if (isRecipeType(data)) {
      recipes.push(dataObj as Record<string, unknown>);
    }
  }

  return recipes;
}

/**
 * Check if a recipe has sufficient fields
 */
function hasSufficientFields(recipe: Record<string, unknown>): boolean {
  if (!recipe || typeof recipe !== 'object') return false;

  const hasTitle = !!recipe.name || !!recipe.headline;
  const hasIngredients =
    !!(
      recipe.recipeIngredient &&
      (Array.isArray(recipe.recipeIngredient)
        ? recipe.recipeIngredient.length > 0
        : recipe.recipeIngredient)
    ) ||
    !!(
      recipe.hasPart &&
      Array.isArray(recipe.hasPart) &&
      (recipe.hasPart as unknown[]).some((p: unknown) => {
        const list =
          p && typeof p === 'object'
            ? (p as Record<string, unknown>).itemListElement
            : undefined;
        return Array.isArray(list) && list.length > 0;
      })
    );
  const hasSteps = !!(
    recipe.recipeInstructions &&
    (Array.isArray(recipe.recipeInstructions)
      ? recipe.recipeInstructions.length > 0
      : recipe.recipeInstructions)
  );

  return hasTitle && (hasIngredients || hasSteps);
}

/**
 * Extract a single instruction text (for one step)
 */
function _extractInstructionText(instruction: unknown): string | null {
  if (typeof instruction === 'string') {
    return instruction.trim();
  }

  if (instruction && typeof instruction === 'object') {
    const inst = instruction as Record<string, unknown>;
    if (inst.text) {
      return String(inst.text).trim();
    }
    if (inst.itemListElement && Array.isArray(inst.itemListElement)) {
      return (inst.itemListElement as unknown[])
        .map((item: unknown) => _extractInstructionText(item))
        .filter((text: string | null) => text)
        .join(' ');
    }
  }

  return null;
}

/**
 * Flatten recipe instructions to an array of step texts.
 * HowToSection with itemListElement yields one step per element; HowToStep yields one step.
 * This ensures sites like foodbymars.com (WP Recipe Maker) get correct step-by-step instructions.
 */
function flattenInstructionSteps(instruction: unknown): string[] {
  if (typeof instruction === 'string') {
    const t = instruction.trim();
    return t ? [t] : [];
  }

  if (instruction && typeof instruction === 'object') {
    const inst = instruction as Record<string, unknown>;
    if (inst.text) {
      const t = String(inst.text).trim();
      return t ? [t] : [];
    }
    if (inst.itemListElement && Array.isArray(inst.itemListElement)) {
      return (inst.itemListElement as unknown[]).flatMap((item: unknown) =>
        flattenInstructionSteps(item),
      );
    }
  }

  return [];
}

/**
 * If a single instruction string actually contains multiple numbered steps (e.g. "1. ... 2. ... 3. ..."),
 * split it into separate steps so we don't lose content. Some JSON-LD outputs one blob for all steps.
 */
function splitMultiStepInstruction(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 100) return trimmed ? [trimmed] : [];

  // Match: start or newline, then number + period/paren + space, e.g. "1. " or "\n2) "
  const stepStart = /(?:^|\n)\s*(\d+)\s*[.)]\s+/g;
  const parts: string[] = [];
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = stepStart.exec(trimmed)) !== null) {
    if (match.index > lastEnd) {
      const segment = trimmed.slice(lastEnd, match.index).trim();
      if (segment) parts.push(segment);
    }
    lastEnd = match.index;
  }

  if (lastEnd < trimmed.length) {
    const segment = trimmed.slice(lastEnd).trim();
    if (segment) parts.push(segment);
  }

  if (parts.length >= 2) return parts;

  // Fallback: split on **Bold step title:** pattern (e.g. "**Prepare the steak:** ... **Grill steak:**")
  const boldSplits = trimmed.split(/\n\s*\*\*([^*]+)\*\*:?\s*/).filter(Boolean);
  if (boldSplits.length >= 2) {
    const result: string[] = [];
    for (let i = 0; i < boldSplits.length; i++) {
      const s = boldSplits[i].trim();
      if (!s) continue;
      result.push(s);
    }
    if (result.length >= 2) return result;
  }

  // Fallback: split on paragraph-style step titles (e.g. "Prepare the steak with marinade:\n...\nGrill steak:\n...")
  // Each step is a line starting with an imperative phrase ending in ": " (Prepare..., Grill..., Make..., Assemble...)
  const stepTitlePattern =
    /\n\s*((?:Prepare|Grill|Make|Assemble|Add|Combine|Mix|Bake|Cook|Heat|Stir|Remove|Place|Serve|Bring|Drain|Cut|Slice)[^\n:]{0,70}:)\s*/gi;
  const partsByTitle = trimmed
    .split(stepTitlePattern)
    .map((s) => s.trim())
    .filter(Boolean);
  if (partsByTitle.length >= 3) {
    const result: string[] = [];
    let i = 0;
    if (
      partsByTitle[0] &&
      partsByTitle[0].toLowerCase().startsWith('instruction')
    ) {
      i = 1;
    }
    while (i < partsByTitle.length) {
      const title = partsByTitle[i];
      const content = partsByTitle[i + 1] ?? '';
      if (title && /^[A-Z]/.test(title)) {
        result.push(content ? `${title} ${content}` : title);
      }
      i += 2;
    }
    if (result.length >= 2) return result;
  }

  return [trimmed];
}

/**
 * Convert ISO 8601 duration to minutes
 * Examples: "PT30M" -> 30, "PT1H30M" -> 90, "PT45M" -> 45
 */
function parseDurationToMinutes(
  duration: string | undefined | null,
): number | undefined {
  if (!duration || typeof duration !== 'string') {
    return undefined;
  }

  // Remove PT prefix
  const timeStr = duration.replace(/^PT/i, '');
  if (!timeStr) return undefined;

  let totalMinutes = 0;

  // Match hours (H) and minutes (M)
  const hourMatch = timeStr.match(/(\d+)H/i);
  const minuteMatch = timeStr.match(/(\d+)M/i);

  if (hourMatch) {
    totalMinutes += parseInt(hourMatch[1], 10) * 60;
  }

  if (minuteMatch) {
    totalMinutes += parseInt(minuteMatch[1], 10);
  }

  return totalMinutes > 0 ? totalMinutes : undefined;
}

/**
 * Convert English units to Dutch/metric units
 * Used when extracting from English recipes for Dutch users
 */
function _convertUnitToDutch(
  unit: string | undefined | null,
  quantity: number | undefined | null,
  targetLocale: string,
): { unit: string | null; quantity: number | null } {
  if (
    !unit ||
    quantity == null ||
    quantity === undefined ||
    targetLocale !== 'nl'
  ) {
    return { unit: unit || null, quantity: quantity ?? null };
  }

  const lowerUnit = unit.toLowerCase().trim();

  // Volume conversions
  if (lowerUnit.includes('cup') || lowerUnit === 'c' || lowerUnit === 'c.') {
    return { unit: 'ml', quantity: Math.round(quantity * 240) };
  }
  if (
    lowerUnit.includes('tablespoon') ||
    lowerUnit === 'tbsp' ||
    lowerUnit === 'tbs' ||
    lowerUnit === 'T' ||
    lowerUnit === 'T.'
  ) {
    return { unit: 'el', quantity: Math.round(quantity) };
  }
  if (
    lowerUnit.includes('teaspoon') ||
    lowerUnit === 'tsp' ||
    lowerUnit === 't' ||
    lowerUnit === 't.'
  ) {
    return { unit: 'tl', quantity: Math.round(quantity) };
  }
  if (
    lowerUnit.includes('fluid ounce') ||
    lowerUnit === 'fl oz' ||
    lowerUnit === 'fl. oz.'
  ) {
    return { unit: 'ml', quantity: Math.round(quantity * 30) };
  }
  if (lowerUnit === 'pint' || lowerUnit === 'pt' || lowerUnit === 'pt.') {
    return { unit: 'ml', quantity: Math.round(quantity * 500) };
  }
  if (lowerUnit === 'quart' || lowerUnit === 'qt' || lowerUnit === 'qt.') {
    return { unit: 'ml', quantity: Math.round(quantity * 1000) };
  }

  // Weight conversions
  if (
    lowerUnit.includes('ounce') ||
    lowerUnit === 'oz' ||
    lowerUnit === 'oz.'
  ) {
    if (lowerUnit.includes('fluid')) {
      // Already handled above
      return { unit: 'ml', quantity: Math.round(quantity * 30) };
    }
    return { unit: 'g', quantity: Math.round(quantity * 28) };
  }
  if (
    lowerUnit.includes('pound') ||
    lowerUnit === 'lb' ||
    lowerUnit === 'lbs' ||
    lowerUnit === 'lb.'
  ) {
    return { unit: 'g', quantity: Math.round(quantity * 450) };
  }

  // Keep metric units as-is
  if (
    [
      'g',
      'kg',
      'ml',
      'l',
      'el',
      'tl',
      'gram',
      'kilogram',
      'milliliter',
      'liter',
    ].includes(lowerUnit)
  ) {
    return { unit, quantity };
  }

  // Unknown unit, keep as-is
  return { unit, quantity };
}

/**
 * Check if a URL is a tracking pixel or non-image URL
 */
function isTrackingPixelOrNonImage(url: string): boolean {
  const lowerUrl = url.toLowerCase();

  // Check for tracking pixels and analytics
  const trackingPatterns = [
    'facebook.com/tr',
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    '/analytics',
    '/tracking',
    '/pixel',
    '/beacon',
    'noscript',
    'amp;', // HTML entities
  ];

  if (trackingPatterns.some((pattern) => lowerUrl.includes(pattern))) {
    return true;
  }

  // Check if URL has query params but no image extension
  if (
    url.includes('?') &&
    !url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i)
  ) {
    // Might be a tracking pixel, but allow if it's from a known image CDN
    const imageCdnPatterns = [
      'imgur.com',
      'cloudinary.com',
      'unsplash.com',
      'pexels.com',
    ];
    if (!imageCdnPatterns.some((cdn) => lowerUrl.includes(cdn))) {
      return true;
    }
  }

  return false;
}

/**
 * Extract image URL from recipe JSON-LD
 * Handles both string URLs and ImageObject with url property
 * Filters out tracking pixels and non-image URLs
 */
function extractImageUrl(recipe: Record<string, unknown>): string | undefined {
  if (!recipe.image) {
    return undefined;
  }

  let imageUrl: string | undefined;

  // If image is a string, return it
  if (typeof recipe.image === 'string') {
    imageUrl = recipe.image;
  }
  // If image is an array, take the first item
  else if (Array.isArray(recipe.image)) {
    const firstImage = recipe.image[0];
    if (typeof firstImage === 'string') {
      imageUrl = firstImage;
    } else if (firstImage && typeof firstImage === 'object' && firstImage.url) {
      imageUrl =
        typeof firstImage.url === 'string' ? firstImage.url : undefined;
    }
  }
  // If image is an object with url property
  else if (
    recipe.image &&
    typeof recipe.image === 'object' &&
    (recipe.image as Record<string, unknown>).url
  ) {
    const imgUrl = (recipe.image as Record<string, unknown>).url;
    imageUrl = typeof imgUrl === 'string' ? imgUrl : undefined;
  }

  // Filter out tracking pixels
  if (imageUrl && isTrackingPixelOrNonImage(imageUrl)) {
    console.warn(
      `[fetchAndParseRecipeJsonLd] Filtered out tracking pixel or non-image URL: ${imageUrl}`,
    );
    return undefined;
  }

  return imageUrl;
}

/**
 * Map JSON-LD Recipe to RecipeDraft
 */
function mapRecipeToDraft(
  recipe: Record<string, unknown>,
  sourceUrl: string,
): RecipeDraft {
  // Extract title
  const title = recipe.name || recipe.headline || 'Untitled Recipe';
  if (typeof title !== 'string') {
    throw new Error('Recipe title must be a string');
  }

  // Extract description
  let description: string | undefined;
  if (recipe.description) {
    description =
      typeof recipe.description === 'string'
        ? recipe.description
        : String(recipe.description);
  }

  // Extract servings
  let servings: string | undefined;
  if (recipe.recipeYield) {
    servings =
      typeof recipe.recipeYield === 'string'
        ? recipe.recipeYield
        : String(recipe.recipeYield);
  }

  // Extract image URL
  let imageUrl = extractImageUrl(recipe);

  // Convert relative URLs to absolute URLs
  if (imageUrl) {
    try {
      const baseUrl = new URL(sourceUrl);
      if (imageUrl.startsWith('/')) {
        // Relative URL - resolve against base URL
        imageUrl = new URL(imageUrl, baseUrl.origin).toString();
      } else if (
        !imageUrl.startsWith('http://') &&
        !imageUrl.startsWith('https://')
      ) {
        // Protocol-relative URL (//example.com/image.jpg)
        imageUrl = `https:${imageUrl}`;
      }
      // If already absolute, keep as is
    } catch (urlError) {
      console.error(
        `[fetchAndParseRecipeJsonLd] Error resolving image URL:`,
        urlError,
      );
      // Keep original URL if resolution fails
    }
  }

  // Extract times (ISO 8601 duration format: PT30M, PT1H30M, etc.)
  const prepTimeMinutes = parseDurationToMinutes(
    recipe.prepTime as string | null | undefined,
  );
  const cookTimeMinutes = parseDurationToMinutes(
    recipe.cookTime as string | null | undefined,
  );
  const totalTimeMinutes = parseDurationToMinutes(
    recipe.totalTime as string | null | undefined,
  );

  // Extract ingredients (flat list or from hasPart/ItemList for some plugins)
  const ingredients: { text: string }[] = [];
  const pushIngredient = (raw: unknown) => {
    if (typeof raw === 'string' && raw.trim()) {
      ingredients.push({ text: raw.trim() });
    } else if (
      raw &&
      typeof raw === 'object' &&
      typeof (raw as Record<string, unknown>).text === 'string'
    ) {
      ingredients.push({
        text: String((raw as Record<string, unknown>).text).trim(),
      });
    }
  };

  if (recipe.recipeIngredient) {
    const list = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient
      : [recipe.recipeIngredient];
    for (const ingredient of list) {
      pushIngredient(ingredient);
    }
  }
  if (
    ingredients.length === 0 &&
    recipe.hasPart &&
    Array.isArray(recipe.hasPart)
  ) {
    for (const part of recipe.hasPart as unknown[]) {
      if (part && typeof part === 'object') {
        const p = part as Record<string, unknown>;
        if (Array.isArray(p.itemListElement)) {
          for (const item of p.itemListElement) {
            if (typeof item === 'string') {
              pushIngredient(item);
            } else if (
              item &&
              typeof item === 'object' &&
              (item as Record<string, unknown>).text != null
            ) {
              pushIngredient((item as Record<string, unknown>).text);
            } else {
              pushIngredient(item);
            }
          }
        }
      }
    }
  }

  // Extract steps/instructions (flatten HowToSection; split single blobs that contain "1. ... 2. ..." or "Prepare...:\nGrill...:")
  let steps: { text: string }[] = [];
  if (recipe.recipeInstructions) {
    const instructionList = Array.isArray(recipe.recipeInstructions)
      ? recipe.recipeInstructions
      : [recipe.recipeInstructions];

    for (const instruction of instructionList) {
      const texts = flattenInstructionSteps(instruction);
      for (const text of texts) {
        if (!text) continue;
        const split = splitMultiStepInstruction(text);
        for (const stepText of split) {
          if (stepText.trim()) steps.push({ text: stepText.trim() });
        }
      }
    }
    // If we got many short steps (e.g. one sentence each), merge into paragraph-style steps
    steps = mergeInstructionsIntoParagraphs(steps);
  }

  // Extract source language
  let sourceLanguage: string | undefined;
  if (recipe.inLanguage) {
    sourceLanguage =
      typeof recipe.inLanguage === 'string'
        ? recipe.inLanguage
        : String(recipe.inLanguage);
  }

  return {
    title,
    description,
    servings,
    ingredients,
    steps,
    sourceUrl,
    sourceLanguage,
    imageUrl,
    prepTimeMinutes,
    cookTimeMinutes,
    totalTimeMinutes,
  };
}

/**
 * Fetch and parse recipe from URL
 *
 * @param url - URL to fetch recipe from (used when html not provided)
 * @param existingHtml - Optional pre-fetched HTML to avoid duplicate fetch
 * @returns Recipe draft or error
 */
export async function fetchAndParseRecipeJsonLd(
  url: string,
  existingHtml?: string,
): Promise<FetchAndParseResult> {
  try {
    // Use pre-fetched HTML if provided, otherwise fetch
    let html: string;
    if (existingHtml != null && existingHtml.length > 0) {
      html = existingHtml;
    } else {
      try {
        html = await fetchHtml(url);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to fetch URL';
        const errorCode = (error as { code?: string })?.code;

        if (
          errorCode === 'ACCESS_DENIED' ||
          errorCode === 'NOT_FOUND' ||
          errorCode === 'CLIENT_ERROR' ||
          errorCode === 'SERVER_ERROR'
        ) {
          return {
            ok: false,
            errorCode: 'NO_RECIPE_FOUND',
            message: errorMessage,
          };
        }

        if (errorCode === 'UNSUPPORTED_CONTENT_TYPE') {
          return {
            ok: false,
            errorCode: 'UNSUPPORTED_CONTENT_TYPE',
            message: errorMessage,
          };
        }

        if (errorCode === 'RESPONSE_TOO_LARGE') {
          return {
            ok: false,
            errorCode: 'RESPONSE_TOO_LARGE',
            message: errorMessage,
          };
        }

        return {
          ok: false,
          errorCode: 'FETCH_FAILED',
          message: errorMessage,
        };
      }
    }

    // Extract JSON-LD blocks
    const jsonLdBlocks = extractJsonLdBlocks(html);
    const diagnostics: RecipeExtractionDiagnostics = {
      jsonLdBlocksFound: jsonLdBlocks.length,
      recipesFound: 0,
    };

    if (jsonLdBlocks.length === 0) {
      // Provide more helpful error message
      const hasScriptTags = html.includes('<script');
      const hasJsonLd =
        html.includes('application/ld+json') ||
        html.includes('application/ld+json');

      let message = 'No JSON-LD blocks found in HTML';
      if (hasScriptTags && !hasJsonLd) {
        message += '. The page contains script tags but no JSON-LD data.';
      } else if (!hasScriptTags) {
        message += '. The page does not appear to contain any script tags.';
      }

      return {
        ok: false,
        errorCode: 'NO_RECIPE_FOUND',
        message,
      };
    }

    // Parse JSON-LD blocks and find recipes
    const allRecipes: Record<string, unknown>[] = [];

    for (const block of jsonLdBlocks) {
      try {
        const data = JSON.parse(block);
        const recipes = findRecipes(data);
        allRecipes.push(...recipes);
      } catch (_error) {
        // Continue to next block if this one fails to parse
        continue;
      }
    }

    diagnostics.recipesFound = allRecipes.length;

    if (allRecipes.length === 0) {
      return {
        ok: false,
        errorCode: 'NO_RECIPE_FOUND',
        message: 'No Recipe objects found in JSON-LD blocks',
      };
    }

    // Find first recipe with sufficient fields
    let selectedRecipe: Record<string, unknown> | null = null;
    for (const recipe of allRecipes) {
      if (hasSufficientFields(recipe)) {
        selectedRecipe = recipe;
        break;
      }
    }

    if (!selectedRecipe) {
      return {
        ok: false,
        errorCode: 'NO_RECIPE_FOUND',
        message:
          'No Recipe found with sufficient fields (title + ingredients or steps)',
      };
    }

    // Map to RecipeDraft
    try {
      const draft = mapRecipeToDraft(selectedRecipe, url);

      // Fallback: on WPRM/recipe sites, always try HTML instructions; use them when we get at least as many steps (fixes truncated JSON-LD)
      const isWprmOrRecipe =
        html.includes('wprm-recipe-instruction') ||
        html.includes('wprm-recipe-instructions') ||
        html.includes('wprm-recipe-container');
      if (isWprmOrRecipe) {
        const fromHtml = extractInstructionsFromHtml(html);
        if (fromHtml.length > 0 && fromHtml.length >= draft.steps.length) {
          draft.steps = fromHtml;
        }
      }

      return {
        ok: true,
        draft,
        diagnostics,
      };
    } catch (error) {
      return {
        ok: false,
        errorCode: 'JSONLD_PARSE_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to map recipe to draft',
      };
    }
  } catch (error) {
    return {
      ok: false,
      errorCode: 'FETCH_FAILED',
      message:
        error instanceof Error
          ? error.message
          : 'Unknown error during fetch and parse',
    };
  }
}
