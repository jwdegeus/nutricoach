'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import {
  getProductSourceConfigForAdmin,
  testAlbertHeijnConnection,
  type ProductSourceConfigForAdmin,
} from '@/src/lib/pantry/sources';

export type ProductSourceConfigActionResult =
  | { ok: true; data: ProductSourceConfigForAdmin[] }
  | { ok: false; error: string };

/**
 * Load product source config for admin UI (no credentials).
 */
export async function getProductSourceConfigAction(): Promise<ProductSourceConfigActionResult> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) {
    return { ok: false, error: 'Geen rechten' };
  }
  const rows = await getProductSourceConfigForAdmin();
  return { ok: true, data: rows };
}

/**
 * Update is_enabled and/or priority for a product source.
 */
export async function updateProductSourceConfigAction(
  id: string,
  payload: { isEnabled?: boolean; priority?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) {
    return { ok: false, error: 'Geen rechten' };
  }

  const supabase = await createClient();
  const updates: Record<string, unknown> = {};
  if (typeof payload.isEnabled === 'boolean') {
    updates.is_enabled = payload.isEnabled;
  }
  if (typeof payload.priority === 'number' && payload.priority >= 1) {
    updates.priority = payload.priority;
  }
  if (Object.keys(updates).length === 0) {
    return { ok: true };
  }

  const { error } = await supabase
    .from('product_source_config')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('[product_source_config] update error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Update credentials (config_json) for a product source. Admin only.
 * Albert Heijn: uses anonymous token auth (no API key). Stores baseUrl, clientId, installationId.
 * @see https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md
 */
export async function updateProductSourceCredentialsAction(
  id: string,
  payload: { baseUrl?: string; clientId?: string; installationId?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) {
    return { ok: false, error: 'Geen rechten' };
  }

  const supabase = await createClient();

  const configJson: Record<string, string> = {};
  if (typeof payload.baseUrl === 'string' && payload.baseUrl.trim() !== '') {
    configJson.baseUrl = payload.baseUrl.trim();
  }
  if (typeof payload.clientId === 'string' && payload.clientId.trim() !== '') {
    configJson.clientId = payload.clientId.trim();
  }
  if (
    typeof payload.installationId === 'string' &&
    payload.installationId.trim() !== ''
  ) {
    const uuid = payload.installationId.trim();
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        uuid,
      )
    ) {
      configJson.installationId = uuid;
    }
  }

  const { error } = await supabase
    .from('product_source_config')
    .update({
      config_json: Object.keys(configJson).length > 0 ? configJson : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('[product_source_config] update credentials error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Test Albert Heijn API connection (anonymous token + search). Admin only.
 */
export async function testAlbertHeijnConnectionAction(): Promise<
  { ok: true; message?: string } | { ok: false; error: string }
> {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) {
    return { ok: false, error: 'Geen rechten' };
  }
  return testAlbertHeijnConnection();
}
