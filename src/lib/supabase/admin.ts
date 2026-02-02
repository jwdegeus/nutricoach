import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase admin client (service role).
 * Use only in server-side code (API routes, server actions for system/cron).
 * Never expose or import in client components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || key.length === 0) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set for admin client',
    );
  }

  return createClient(url, key);
}
