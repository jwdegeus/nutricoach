'use server';

import { createClient } from '@/src/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { storageService } from '@/src/lib/storage/storage.service';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: 'Je moet ingelogd zijn om je profiel bij te werken',
    };
  }

  const fullName = formData.get('full_name') as string;
  const displayName = formData.get('display_name') as string;

  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: fullName || null,
      display_name: displayName || null,
    },
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath('/account');
  return {
    success: true,
    message: 'Profiel succesvol bijgewerkt',
  };
}

export async function updateLanguagePreference(language: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: 'Je moet ingelogd zijn om je taalvoorkeur bij te werken',
    };
  }

  // Validate language
  if (language !== 'nl' && language !== 'en') {
    return {
      error: 'Ongeldige taal. Kies Nederlands of Engels.',
    };
  }

  // Update or insert language preference
  const { error } = await supabase.from('user_preferences').upsert(
    {
      user_id: user.id,
      language: language,
    },
    {
      onConflict: 'user_id',
    },
  );

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath('/account');
  return {
    success: true,
    message: 'Taalvoorkeur succesvol bijgewerkt',
  };
}

/**
 * Upload account avatar (profielfoto). Stores file in storage and saves URL in user_metadata.avatar_url.
 */
export async function uploadAccountAvatarAction(
  formData: FormData,
): Promise<{ ok: true; avatarUrl: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Je moet ingelogd zijn.' };
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

  const useBlob =
    typeof process.env.BLOB_READ_WRITE_TOKEN === 'string' &&
    process.env.BLOB_READ_WRITE_TOKEN.length > 0;
  const uploadResult = useBlob
    ? await storageService.uploadAvatarForAccount(buffer, filename, user.id)
    : await storageService.uploadAvatarForAccount(buffer, filename, user.id);

  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      avatar_url: uploadResult.url,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/account');
  return { ok: true, avatarUrl: uploadResult.url };
}
