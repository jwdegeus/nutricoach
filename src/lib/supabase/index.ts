/**
 * Supabase client exports
 * 
 * Usage:
 * - Server Components: import { createClient } from '@/src/lib/supabase/server'
 * - Client Components: import { createClient } from '@/src/lib/supabase/client'
 * - Middleware: import { updateSession } from '@/src/lib/supabase/middleware'
 */

export { createClient } from "./server";
export { createClient as createBrowserClient } from "./client";
export { updateSession } from "./middleware";
