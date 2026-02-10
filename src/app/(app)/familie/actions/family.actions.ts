'use server';

import { createClient } from '@/src/lib/supabase/server';
import { AppError } from '@/src/lib/errors/app-error';
import { revalidatePath } from 'next/cache';
import { storageService } from '@/src/lib/storage/storage.service';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type FamilyMemberRow = {
  id: string;
  user_id: string;
  name: string;
  is_self: boolean;
  sort_order: number;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

async function getSupabaseAndUserId(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'Je moet ingelogd zijn.');
  }
  return { supabase, userId: user.id };
}

const FAMILY_MEMBERS_SELECT =
  'id, user_id, name, is_self, sort_order, avatar_url, created_at, updated_at';

const FAMILY_MEMBERS_SELECT_WITHOUT_AVATAR =
  'id, user_id, name, is_self, sort_order, created_at, updated_at';

function isMissingColumnError(err: {
  message?: string;
  code?: string;
}): boolean {
  const msg = (err.message ?? '').toLowerCase();
  return (
    msg.includes('avatar_url') &&
    (msg.includes('does not exist') || msg.includes('column'))
  );
}

/**
 * List all family members for the current user.
 * If none exist, ensures one member "Ik" (is_self) exists for the logged-in user and returns it.
 * Works even if avatar_url column is not yet migrated (then avatar_url is null).
 */
export async function listFamilyMembersAction(): Promise<{
  ok: true;
  members: FamilyMemberRow[];
}> {
  const { supabase, userId } = await getSupabaseAndUserId();

  let data: unknown[] | null = null;
  let error: { message: string; code?: string } | null = null;
  let useAvatarColumn = true;

  const { data: firstTry, error: firstError } = await supabase
    .from('family_members')
    .select(FAMILY_MEMBERS_SELECT)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (firstError && isMissingColumnError(firstError)) {
    useAvatarColumn = false;
    const { data: retry, error: retryError } = await supabase
      .from('family_members')
      .select(FAMILY_MEMBERS_SELECT_WITHOUT_AVATAR)
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    data = retry;
    error = retryError;
  } else {
    data = firstTry;
    error = firstError;
  }

  if (error) {
    throw new AppError('DB_ERROR', error.message);
  }

  let members: FamilyMemberRow[] = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      is_self: r.is_self,
      sort_order: r.sort_order,
      avatar_url: useAvatarColumn
        ? ((r.avatar_url as string | null) ?? null)
        : null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    } as FamilyMemberRow;
  });

  if (members.length === 0) {
    const insertPayload = {
      user_id: userId,
      name: 'Ik',
      is_self: true,
      sort_order: 0,
    };
    const { data: inserted, error: insertError } = await supabase
      .from('family_members')
      .insert(insertPayload)
      .select(
        useAvatarColumn
          ? FAMILY_MEMBERS_SELECT
          : FAMILY_MEMBERS_SELECT_WITHOUT_AVATAR,
      )
      .single();

    if (insertError) {
      throw new AppError('DB_ERROR', insertError.message);
    }
    const row = inserted as unknown as Record<string, unknown>;
    members = [
      {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        is_self: row.is_self,
        sort_order: row.sort_order,
        avatar_url: useAvatarColumn
          ? ((row.avatar_url as string | null) ?? null)
          : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } as FamilyMemberRow,
    ];
  }
  return { ok: true, members };
}

/**
 * Create a new family member.
 */
export async function createFamilyMemberAction(input: {
  name: string;
  is_self?: boolean;
}): Promise<
  { ok: true; member: FamilyMemberRow } | { ok: false; error: string }
> {
  const { supabase, userId } = await getSupabaseAndUserId();
  const name = input.name?.trim();
  if (!name) {
    return { ok: false, error: 'Naam is verplicht.' };
  }

  if (input.is_self) {
    const { data: existing } = await supabase
      .from('family_members')
      .select('id')
      .eq('user_id', userId)
      .eq('is_self', true)
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        error: 'Er is al een familielid gemarkeerd als "Ik".',
      };
    }
  }

  const maxOrder = await supabase
    .from('family_members')
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder =
    (maxOrder.data as { sort_order: number } | null)?.sort_order ?? 0;

  const insertPayload = {
    user_id: userId,
    name,
    is_self: input.is_self ?? false,
    sort_order: sortOrder + 1,
  };
  const { data: inserted, error: insertError } = await supabase
    .from('family_members')
    .insert(insertPayload)
    .select(FAMILY_MEMBERS_SELECT)
    .single();

  if (insertError && isMissingColumnError(insertError)) {
    const { data: retry, error: retryError } = await supabase
      .from('family_members')
      .insert(insertPayload)
      .select(FAMILY_MEMBERS_SELECT_WITHOUT_AVATAR)
      .single();
    if (retryError) return { ok: false, error: retryError.message };
    const row = retry as Record<string, unknown>;
    revalidatePath('/familie');
    return {
      ok: true,
      member: { ...row, avatar_url: null } as FamilyMemberRow,
    };
  }
  if (insertError) return { ok: false, error: insertError.message };
  revalidatePath('/familie');
  return { ok: true, member: inserted as FamilyMemberRow };
}

/**
 * Get one family member (must be owned by current user).
 * Works even if avatar_url column is not yet migrated.
 */
export async function getFamilyMemberAction(
  memberId: string,
): Promise<
  { ok: true; member: FamilyMemberRow } | { ok: false; error: string }
> {
  const { supabase, userId } = await getSupabaseAndUserId();
  const { data: first, error: firstError } = await supabase
    .from('family_members')
    .select(FAMILY_MEMBERS_SELECT)
    .eq('id', memberId)
    .eq('user_id', userId)
    .maybeSingle();

  if (firstError && isMissingColumnError(firstError)) {
    const { data: retry, error: retryError } = await supabase
      .from('family_members')
      .select(FAMILY_MEMBERS_SELECT_WITHOUT_AVATAR)
      .eq('id', memberId)
      .eq('user_id', userId)
      .maybeSingle();
    if (retryError) return { ok: false, error: retryError.message };
    if (!retry) return { ok: false, error: 'Familielid niet gevonden.' };
    const row = retry as Record<string, unknown>;
    return {
      ok: true,
      member: {
        ...row,
        avatar_url: null,
      } as FamilyMemberRow,
    };
  }
  if (firstError) return { ok: false, error: firstError.message };
  if (!first) return { ok: false, error: 'Familielid niet gevonden.' };
  return { ok: true, member: first as FamilyMemberRow };
}

/**
 * Update family member name and is_self.
 */
export async function updateFamilyMemberAction(
  memberId: string,
  input: { name?: string; is_self?: boolean },
): Promise<
  { ok: true; member: FamilyMemberRow } | { ok: false; error: string }
> {
  const { supabase, userId } = await getSupabaseAndUserId();
  const { data: existing } = await supabase
    .from('family_members')
    .select('id')
    .eq('id', memberId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) return { ok: false, error: 'Familielid niet gevonden.' };

  if (input.is_self === true) {
    await supabase
      .from('family_members')
      .update({ is_self: false })
      .eq('user_id', userId)
      .neq('id', memberId);
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.is_self !== undefined) updates.is_self = input.is_self;

  const { data: updated, error: updateError } = await supabase
    .from('family_members')
    .update(updates)
    .eq('id', memberId)
    .eq('user_id', userId)
    .select(FAMILY_MEMBERS_SELECT)
    .single();

  if (updateError && isMissingColumnError(updateError)) {
    const { data: retry, error: retryError } = await supabase
      .from('family_members')
      .update(updates)
      .eq('id', memberId)
      .eq('user_id', userId)
      .select(FAMILY_MEMBERS_SELECT_WITHOUT_AVATAR)
      .single();
    if (retryError) return { ok: false, error: retryError.message };
    const row = retry as Record<string, unknown>;
    revalidatePath('/familie');
    revalidatePath(`/familie/${memberId}`);
    return {
      ok: true,
      member: { ...row, avatar_url: null } as FamilyMemberRow,
    };
  }
  if (updateError) return { ok: false, error: updateError.message };
  revalidatePath('/familie');
  revalidatePath(`/familie/${memberId}`);
  return { ok: true, member: updated as FamilyMemberRow };
}

/**
 * Delete a family member (and all related preferences, diet, health, therapeutic data).
 * The logged-in user ("Ik", is_self) cannot be deleted.
 */
export async function deleteFamilyMemberAction(
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, userId } = await getSupabaseAndUserId();
  const { data: existing } = await supabase
    .from('family_members')
    .select('id, is_self')
    .eq('id', memberId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) return { ok: false, error: 'Familielid niet gevonden.' };
  if ((existing as { is_self: boolean }).is_self) {
    return {
      ok: false,
      error: 'Je kunt jezelf niet verwijderen uit de familie.',
    };
  }

  const { error } = await supabase
    .from('family_members')
    .delete()
    .eq('id', memberId)
    .eq('user_id', userId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/familie');
  return { ok: true };
}

/**
 * Get the default family member id for the current user (is_self = true or first member).
 * Used when loading "my" profile for meal planning etc.
 */
export async function getDefaultFamilyMemberIdAction(): Promise<string | null> {
  const { supabase, userId } = await getSupabaseAndUserId();
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
    .limit(1)
    .maybeSingle();
  return first ? (first as { id: string }).id : null;
}

/**
 * Upload avatar (profielfoto) for a family member. Verifies ownership, uploads to storage, updates family_members.avatar_url.
 */
export async function uploadFamilyMemberAvatarAction(
  memberId: string,
  formData: FormData,
): Promise<{ ok: true; avatarUrl: string } | { ok: false; error: string }> {
  const { supabase, userId } = await getSupabaseAndUserId();

  const { data: member } = await supabase
    .from('family_members')
    .select('id')
    .eq('id', memberId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member) {
    return { ok: false, error: 'Familielid niet gevonden.' };
  }

  const file = formData.get('avatar');
  if (!file || !(file instanceof File)) {
    return { ok: false, error: 'Selecteer een afbeelding.' };
  }

  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Alleen JPEG, PNG of WebP zijn toegestaan.' };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: 'Afbeelding mag maximaal 2 MB zijn.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filename = `avatar.${ext}`;

  const uploadResult = await storageService.uploadAvatarForFamilyMember(
    buffer,
    filename,
    userId,
    memberId,
  );

  const { error } = await supabase
    .from('family_members')
    .update({ avatar_url: uploadResult.url })
    .eq('id', memberId)
    .eq('user_id', userId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/familie');
  revalidatePath(`/familie/${memberId}`);
  return { ok: true, avatarUrl: uploadResult.url };
}
