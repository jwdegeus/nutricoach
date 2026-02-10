/**
 * Product lookup aggregator
 *
 * Single entrypoint for barcode lookup: reads enabled sources from config,
 * calls each adapter in priority order, returns first hit or not_found.
 * Albert Heijn is preferred over Open Food Facts so the product can be linked to the shop.
 *
 * Two-step enrichment: when we find a product via Open Food Facts (AH by barcode failed),
 * we search Albert Heijn by product name and attach the AH product URL so the user
 * still gets a shop link. One extra AH request only in that path (~200–500 ms).
 */

import { getProductSourceConfig } from './product-source-config';
import { getOpenFoodFactsProductByBarcode } from './open-food-facts.adapter';
import {
  getAlbertHeijnProductByBarcode,
  searchAlbertHeijnProducts,
} from './albert-heijn.adapter';
import type {
  ProductLookupResult,
  ProductSourceId,
} from './product-source.types';

/** Barcode lookup source order: Albert Heijn first (shop link), then Open Food Facts, then others */
const BARCODE_LOOKUP_PRIORITY: Record<ProductSourceId, number> = {
  albert_heijn: 0,
  openfoodfacts: 1,
};

function barcodeLookupOrder(entry: { source: ProductSourceId }): number {
  return BARCODE_LOOKUP_PRIORITY[entry.source] ?? 2;
}

async function lookupBySource(
  source: ProductSourceId,
  barcode: string,
): Promise<ProductLookupResult> {
  switch (source) {
    case 'openfoodfacts':
      return getOpenFoodFactsProductByBarcode(barcode);
    case 'albert_heijn':
      return getAlbertHeijnProductByBarcode(barcode);
    default:
      return { found: false, reason: 'error', message: 'Onbekende bron' };
  }
}

/**
 * Look up product by barcode using all enabled product sources.
 * Tries Albert Heijn first (for shop link), then Open Food Facts, then other sources.
 * Returns first successful result or not_found/error after trying all.
 */
export async function lookupProductByBarcode(
  barcode: string,
): Promise<ProductLookupResult> {
  const trimmed = barcode.replace(/\s/g, '');
  if (!trimmed) {
    return { found: false, reason: 'error', message: 'Lege barcode' };
  }

  const config = await getProductSourceConfig();
  if (config.length === 0) {
    return {
      found: false,
      reason: 'error',
      message: 'Geen productbronnen actief',
    };
  }

  const sorted = [...config].sort(
    (a, b) => barcodeLookupOrder(a) - barcodeLookupOrder(b),
  );

  const ahEnabled = sorted.some((e) => e.source === 'albert_heijn');

  for (const entry of sorted) {
    const result = await lookupBySource(entry.source, trimmed);
    if (result.found) {
      // Two-step: OFF hit + AH enabled → search AH by product name for shop link
      if (
        entry.source === 'openfoodfacts' &&
        ahEnabled &&
        result.product.name?.trim()
      ) {
        const ahSearch = await searchAlbertHeijnProducts(
          result.product.name,
          1,
        );
        if (
          ahSearch.ok &&
          ahSearch.products.length > 0 &&
          ahSearch.products[0].productUrl
        ) {
          result.product = {
            ...result.product,
            productUrl: ahSearch.products[0].productUrl,
          };
        }
      }
      return result;
    }
    // On rate_limited or error we could continue to next source; for now we return
    if (result.reason === 'rate_limited' || result.reason === 'error') {
      return result;
    }
    // not_found: try next source
  }

  return { found: false, reason: 'not_found' };
}
