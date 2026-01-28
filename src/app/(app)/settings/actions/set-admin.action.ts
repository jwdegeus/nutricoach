'use server';

import { createClient } from '@/src/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Set the current user as admin
 * This only works if there are no existing admins (for initial setup)
 * Otherwise, use SQL directly to set admin roles
 */
export async function setCurrentUserAsAdmin(): Promise<{
  success?: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Je moet ingelogd zijn' };
  }

  // Check if there are any existing admins
  const { data: existingAdmins, error: checkError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')
    .limit(1);

  if (checkError) {
    console.error('Error checking existing admins:', checkError);
    return { error: `Fout bij controleren admins: ${checkError.message}` };
  }

  // If there are existing admins, don't allow self-promotion
  // (use SQL directly instead)
  if (existingAdmins && existingAdmins.length > 0) {
    return {
      error:
        'Er bestaan al admins. Gebruik SQL om een gebruiker admin te maken. Zie de migratie bestanden voor voorbeelden.',
    };
  }

  // Check if user already has admin role
  const { data: existingRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  // If user already has admin role, return success
  if (existingRole?.role === 'admin') {
    return { success: true };
  }

  // Upsert the admin role (only works if no admins exist yet)
  const { error } = await supabase.from('user_roles').upsert(
    {
      user_id: user.id,
      role: 'admin',
    },
    {
      onConflict: 'user_id',
    },
  );

  if (error) {
    console.error('Error setting admin role:', error);
    return { error: `Fout bij instellen admin rol: ${error.message}` };
  }

  revalidatePath('/settings');
  return { success: true };
}
