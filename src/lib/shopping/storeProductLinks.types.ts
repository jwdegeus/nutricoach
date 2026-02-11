/**
 * Store Product Links – types for ingredient ↔ store product preference.
 */

export type StoreProductDisplay = {
  id: string;
  title: string;
  brand: string | null;
  productUrl: string | null;
  priceCents: number | null;
  gtin: string | null;
  categoryPath: string | null;
  isActive: boolean;
};

/** Map DB row (snake_case) to StoreProductDisplay; single place for this mapping. */
export function mapStoreProductRowToDisplay(
  row: Record<string, unknown>,
): StoreProductDisplay {
  return {
    id: row.id as string,
    title: row.title as string,
    brand: (row.brand as string | null) ?? null,
    productUrl: (row.product_url as string | null) ?? null,
    priceCents: row.price_cents != null ? Number(row.price_cents) : null,
    gtin: (row.gtin as string | null) ?? null,
    categoryPath: (row.category_path as string | null) ?? null,
    isActive: row.is_active === true,
  };
}

export type StoreProductLinkResult = {
  storeId: string;
  canonicalIngredientId: string;
  storeProduct: StoreProductDisplay;
};
