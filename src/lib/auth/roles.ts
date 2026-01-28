'use server';

import { createClient } from '@/src/lib/supabase/server';

export type UserRole = 'user' | 'admin';

/**
 * Check if the current authenticated user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  // Direct query instead of RPC for better reliability
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (error) {
    // Only log if it's not a "not found" error (which is expected for non-admins)
    if (error.code !== 'PGRST116') {
      console.error('Error checking admin status:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }
    return false;
  }

  return data !== null && data.role === 'admin';
}

/**
 * Get the role of the current authenticated user
 */
export async function getUserRole(): Promise<UserRole> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return 'user';
  }

  // Direct query instead of RPC for better reliability
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    // Only log if it's not a "not found" error (which is expected for users without explicit role)
    if (error.code !== 'PGRST116') {
      console.error('Error getting user role:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }
    return 'user';
  }

  // Return the role if found, otherwise default to "user"
  return (data?.role as UserRole) || 'user';
}

/**
 * Set a user's role (admin only)
 */
export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Niet ingelogd' };
  }

  // Check if current user is admin
  const isCurrentUserAdmin = await isAdmin();
  if (!isCurrentUserAdmin) {
    return { error: 'Geen toegang: alleen admins kunnen rollen wijzigen' };
  }

  // Upsert the role
  const { error } = await supabase.from('user_roles').upsert(
    {
      user_id: userId,
      role,
    },
    {
      onConflict: 'user_id',
    },
  );

  if (error) {
    console.error('Error setting user role:', error);
    return { error: `Fout bij wijzigen rol: ${error.message}` };
  }

  return {};
}
