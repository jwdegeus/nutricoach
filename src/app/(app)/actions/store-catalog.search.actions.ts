'use server';

import { createClient } from '@/src/lib/supabase/server';

export type StoreProductSearchItem = {
  id: string;
  storeId: string;
  title: string;
  brand?: string | null;
  productUrl: string;
  imageUrl?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  unitLabel?: string | null;
  isActive: boolean;
};

const LIMIT_MIN = 5;
const LIMIT_MAX = 50;
const LIMIT_DEFAULT = 20;

/**
 * Escape ILIKE pattern special chars: % _ \
 * Comma would break .or() filter, so replace with space.
 * Then wrap in % for partial match.
 */
function ilikePattern(raw: string): string {
  const noComma = raw.replace(/,/g, ' ');
  const escaped = noComma
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
  return `%${escaped}%`;
}

function mapRow(row: {
  id: string;
  store_id: string;
  title: string;
  brand: string | null;
  product_url: string;
  image_url: string | null;
  price_cents: number | null;
  currency: string | null;
  unit_label: string | null;
  is_active: boolean;
}): StoreProductSearchItem {
  return {
    id: row.id,
    storeId: row.store_id,
    title: row.title,
    brand: row.brand ?? null,
    productUrl: row.product_url,
    imageUrl: row.image_url ?? null,
    priceCents: row.price_cents ?? null,
    currency: row.currency ?? null,
    unitLabel: row.unit_label ?? null,
    isActive: row.is_active,
  };
}

/**
 * Search store products by title/brand (ILIKE). RLS applies via user-context client.
 * Returns minimal fields for UI; is_active = true by default.
 */
export async function searchStoreProductsAction(input: {
  q: string;
  storeId?: string;
  limit?: number;
}): Promise<{ items: StoreProductSearchItem[] }> {
  const q = input.q?.trim() ?? '';
  if (q.length < 2) {
    return { items: [] };
  }

  const limit = Math.min(
    LIMIT_MAX,
    Math.max(
      LIMIT_MIN,
      typeof input.limit === 'number' && Number.isFinite(input.limit)
        ? input.limit
        : LIMIT_DEFAULT,
    ),
  );

  const supabase = await createClient();
  const pattern = ilikePattern(q);

  let query = supabase
    .from('store_products')
    .select(
      'id, store_id, title, brand, product_url, image_url, price_cents, currency, unit_label, is_active',
    )
    .eq('is_active', true)
    .or(`title.ilike.${pattern},brand.ilike.${pattern}`)
    .order('title', { ascending: true })
    .limit(limit);

  if (input.storeId) {
    query = query.eq('store_id', input.storeId);
  }

  const { data, error } = await query;

  if (error) {
    return { items: [] };
  }

  const rows = (data ?? []) as Parameters<typeof mapRow>[0][];
  return { items: rows.map(mapRow) };
}
