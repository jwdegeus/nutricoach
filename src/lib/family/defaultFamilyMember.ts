/**
 * Resolve the default family member id for a user (is_self = true or first by sort_order).
 * Used server-side when loading "the user's" profile from family as source of truth.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function getDefaultFamilyMemberId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: self } = await supabase
    .from('family_members')
    .select('id')
    .eq('user_id', userId)
    .eq('is_self', true)
    .maybeSingle();

  if (self) return (self as { id: string }).id;

  const { data: first } = await supabase
    .from('family_members')
    .select('id')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return first ? (first as { id: string }).id : null;
}
