/**
 * Product search aggregator
 *
 * Single entrypoint for product search: reads enabled sources from config,
 * calls each adapter that supports search, merges results.
 * Albert Heijn is preferred first (same as barcode lookup) so shop links appear first.
 */

import { getProductSourceConfig } from './product-source-config';
import { searchOpenFoodFactsProducts } from './open-food-facts.adapter';
import { searchAlbertHeijnProducts } from './albert-heijn.adapter';
import type {
  ExternalProduct,
  ProductSearchResult,
  ProductSourceId,
} from './product-source.types';

const DEFAULT_LIMIT_PER_SOURCE = 10;

/** Search source order: Albert Heijn first, then Open Food Facts */
const SEARCH_PRIORITY: Record<ProductSourceId, number> = {
  albert_heijn: 0,
  openfoodfacts: 1,
};

function searchOrder(entry: { source: ProductSourceId }): number {
  return SEARCH_PRIORITY[entry.source] ?? 2;
}

async function searchBySource(
  source: ProductSourceId,
  query: string,
  limit: number,
): Promise<ProductSearchResult> {
  switch (source) {
    case 'openfoodfacts':
      return searchOpenFoodFactsProducts(query, limit);
    case 'albert_heijn':
      return searchAlbertHeijnProducts(query, limit);
    default:
      return { ok: true, products: [] };
  }
}

/**
 * Search all enabled product sources and merge results.
 * Tries Albert Heijn first, then Open Food Facts. On rate_limited, returns immediately.
 */
export async function searchProducts(
  query: string,
  limitPerSource = DEFAULT_LIMIT_PER_SOURCE,
): Promise<ProductSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: true, products: [] };
  }

  const config = await getProductSourceConfig();
  if (config.length === 0) {
    return { ok: true, products: [] };
  }

  const sorted = [...config].sort((a, b) => searchOrder(a) - searchOrder(b));
  const allProducts: ExternalProduct[] = [];

  for (const entry of sorted) {
    const result = await searchBySource(entry.source, trimmed, limitPerSource);

    if (!result.ok) {
      if (result.reason === 'rate_limited') {
        return result;
      }
      // On error, skip this source and continue
      continue;
    }

    allProducts.push(...result.products);
  }

  return { ok: true, products: allProducts };
}
