/**
 * Product source config loader
 *
 * Reads which product sources are enabled and their priority from the database.
 * Used by the lookup aggregator and by admin UI (without exposing credentials).
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import type { ProductSourceId } from './product-source.types';

export type ProductSourceConfigRow = {
  id: string;
  source: string;
  is_enabled: boolean;
  priority: number;
  config_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

/** Config entry for lookup: only enabled sources, ordered by priority */
export type ProductSourceConfigEntry = {
  source: ProductSourceId;
  priority: number;
};

/** Config entry for admin UI: no credentials, only "has credentials" flag */
export type ProductSourceConfigForAdmin = {
  id: string;
  source: ProductSourceId;
  isEnabled: boolean;
  priority: number;
  hasCredentials: boolean;
  updatedAt: string;
};

function toSourceId(source: string): ProductSourceId {
  if (source === 'openfoodfacts' || source === 'albert_heijn') return source;
  return 'openfoodfacts'; // fallback
}

/**
 * Load enabled product sources for lookup aggregator.
 * Returns only enabled rows, sorted by priority (asc).
 * Does not include config_json.
 */
export async function getProductSourceConfig(): Promise<
  ProductSourceConfigEntry[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_source_config')
    .select('source, priority')
    .eq('is_enabled', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error(
      '[product_source_config] getProductSourceConfig error:',
      error,
    );
    return [];
  }

  return (data || []).map((row) => ({
    source: toSourceId(row.source),
    priority: Number(row.priority),
  }));
}

/**
 * Load all product source config rows for admin UI.
 * Returns hasCredentials (true if config_json is non-empty), never the actual credentials.
 */
export async function getProductSourceConfigForAdmin(): Promise<
  ProductSourceConfigForAdmin[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_source_config')
    .select('id, source, is_enabled, priority, config_json, updated_at')
    .order('priority', { ascending: true });

  if (error) {
    console.error(
      '[product_source_config] getProductSourceConfigForAdmin error:',
      error,
    );
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    source: toSourceId(row.source),
    isEnabled: Boolean(row.is_enabled),
    priority: Number(row.priority),
    hasCredentials: Boolean(
      row.config_json &&
      typeof row.config_json === 'object' &&
      Object.keys(row.config_json).length > 0,
    ),
    updatedAt: row.updated_at,
  }));
}

/**
 * Load config_json for a specific source. Server-only, for use by adapters (e.g. AH).
 * Returns null if source not found or config empty.
 */
export async function getProductSourceConfigJson(
  source: ProductSourceId,
): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_source_config')
    .select('config_json')
    .eq('source', source)
    .maybeSingle();

  if (error || !data?.config_json || typeof data.config_json !== 'object') {
    return null;
  }
  return data.config_json as Record<string, unknown>;
}
