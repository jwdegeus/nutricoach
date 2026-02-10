/**
 * Open Food Facts API adapter
 *
 * Fetches product data from OFF API v2 and maps to ExternalProduct.
 * Rate limits: 100 req/min for product, 10 req/min for search.
 * Always send a custom User-Agent.
 *
 * @see https://openfoodfacts.github.io/openfoodfacts-server/api/
 */

import type {
  ExternalProduct,
  ProductLookupResult,
  ProductSearchResult,
} from './product-source.types';

const OFF_BASE = 'https://world.openfoodfacts.org';
const USER_AGENT = 'NutriCoach/1.0 (https://github.com/nutricoach)';

/** OFF API v2 product response (subset we use) */
type OffProductResponse = {
  code?: string;
  status?: number;
  status_verbose?: string;
  product?: {
    product_name?: string;
    brands?: string;
    nutrition_grades?: string;
    image_url?: string;
    image_small_url?: string;
    image_front_url?: string;
    quantity?: string;
  };
};

function mapNutriscoreGrade(
  grade: string | undefined,
): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  if (!grade || grade.length !== 1) return null;
  const upper = grade.toUpperCase();
  if (
    upper === 'A' ||
    upper === 'B' ||
    upper === 'C' ||
    upper === 'D' ||
    upper === 'E'
  ) {
    return upper;
  }
  return null;
}

/**
 * Fetch product by barcode from Open Food Facts.
 * Returns normalized ExternalProduct or not_found/error.
 */
export async function getOpenFoodFactsProductByBarcode(
  barcode: string,
): Promise<ProductLookupResult> {
  const trimmed = barcode.replace(/\s/g, '');
  if (!trimmed) {
    return { found: false, reason: 'error', message: 'Lege barcode' };
  }

  const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(trimmed)}.json?fields=code,product_name,brands,nutrition_grades,image_url,image_small_url,image_front_url,quantity,status`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      next: { revalidate: 60 }, // cache 1 min to respect rate limits
    });

    if (!res.ok) {
      if (res.status === 429) {
        return {
          found: false,
          reason: 'rate_limited',
          message: 'Te veel verzoeken. Probeer later opnieuw.',
        };
      }
      return { found: false, reason: 'error', message: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as OffProductResponse;

    if (data.status !== 1 || !data.product) {
      return { found: false, reason: 'not_found' };
    }

    const p = data.product;
    const name = (p.product_name ?? '').trim() || 'Onbekend product';
    const brand = (p.brands ?? '').trim();
    const imageUrl =
      p.image_small_url ?? p.image_front_url ?? p.image_url ?? null;
    const quantity = (p.quantity ?? '').trim() || null;

    const code = (data.code ?? trimmed).trim();
    const product: ExternalProduct = {
      source: 'openfoodfacts',
      barcode: code || null,
      name,
      brand,
      nutriscoreGrade: mapNutriscoreGrade(p.nutrition_grades),
      imageUrl,
      quantity,
      productUrl: code ? `${OFF_BASE}/product/${code}` : null,
    };

    return { found: true, product };
  } catch (err) {
    console.error('[OpenFoodFacts] getByBarcode error:', err);
    return {
      found: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Lookup mislukt',
    };
  }
}

/** OFF cgi search response (subset) */
type OffSearchResponse = {
  count?: number;
  products?: Array<{
    code?: string;
    product_name?: string;
    brands?: string;
    nutrition_grades?: string;
    image_small_url?: string;
  }>;
};

/**
 * Search Open Food Facts by query.
 * Rate limit: 10 req/min – do not use for type-ahead; use explicit search button.
 */
export async function searchOpenFoodFactsProducts(
  query: string,
  limit = 10,
): Promise<ProductSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: true, products: [] };
  }

  const params = new URLSearchParams({
    search_terms: trimmed,
    json: '1',
    page_size: String(Math.min(limit, 20)),
    fields: 'code,product_name,brands,nutrition_grades,image_small_url',
  });
  const url = `${OFF_BASE}/cgi/search.pl?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      next: { revalidate: 30 },
    });

    if (res.status === 429) {
      return {
        ok: false,
        reason: 'rate_limited',
        message: 'Te veel zoekverzoeken. Probeer over een minuut opnieuw.',
      };
    }
    if (!res.ok) {
      return { ok: false, reason: 'error', message: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as OffSearchResponse;
    const products = data.products ?? [];
    const mapped: ExternalProduct[] = products.map((p) => {
      const code = (p.code ?? '').trim();
      return {
        source: 'openfoodfacts',
        barcode: code || null,
        name: (p.product_name ?? '').trim() || 'Onbekend product',
        brand: (p.brands ?? '').trim(),
        nutriscoreGrade: mapNutriscoreGrade(p.nutrition_grades),
        imageUrl: (p.image_small_url ?? '').trim() || null,
        quantity: null,
        productUrl: code ? `${OFF_BASE}/product/${code}` : null,
      };
    });

    return { ok: true, products: mapped };
  } catch (err) {
    console.error('[OpenFoodFacts] search error:', err);
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Zoeken mislukt',
    };
  }
}
