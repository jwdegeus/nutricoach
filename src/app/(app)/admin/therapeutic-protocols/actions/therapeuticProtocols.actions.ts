'use server';

import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { z } from 'zod';

/** Explicit columns for therapeutic_protocols list (no SELECT *). */
const THERAPEUTIC_PROTOCOLS_LIST_COLUMNS =
  'id,protocol_key,name_nl,version,is_active,updated_at';

export type TherapeuticProtocolRow = {
  id: string;
  protocol_key: string;
  name_nl: string;
  version: string | null;
  is_active: boolean;
  updated_at: string;
};

type ActionResult<T> = { data: T } | { error: string };

/**
 * List all therapeutic protocols (admin only). RLS: admins see all rows.
 */
export async function listTherapeuticProtocolsAction(): Promise<
  ActionResult<TherapeuticProtocolRow[]>
> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('therapeutic_protocols')
    .select(THERAPEUTIC_PROTOCOLS_LIST_COLUMNS)
    .order('protocol_key');

  if (error) {
    return { error: error.message };
  }

  const rows: TherapeuticProtocolRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    protocol_key: r.protocol_key as string,
    name_nl: (r.name_nl as string) ?? '',
    version: r.version as string | null,
    is_active: Boolean(r.is_active),
    updated_at: (r.updated_at as string) ?? '',
  }));

  return { data: rows };
}

const toggleActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

/**
 * Toggle is_active for a therapeutic protocol (admin only). Updates only is_active.
 */
export async function toggleTherapeuticProtocolActiveAction(
  input: z.infer<typeof toggleActiveSchema>,
): Promise<ActionResult<null>> {
  const admin = await isAdmin();
  if (!admin) {
    return { error: 'Geen toegang: alleen admins' };
  }

  const parsed = toggleActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Ongeldige invoer' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('therapeutic_protocols')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id)
    .select('id')
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data: null };
}
