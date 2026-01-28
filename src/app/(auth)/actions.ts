'use server';

import { createClient } from '@/src/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const passwordConfirm = formData.get('passwordConfirm') as string;

  // Validation
  if (!email || !password || !passwordConfirm) {
    return {
      error: 'Alle velden zijn verplicht',
    };
  }

  if (password !== passwordConfirm) {
    return {
      error: 'Wachtwoorden komen niet overeen',
    };
  }

  if (password.length < 6) {
    return {
      error: 'Wachtwoord moet minimaal 6 tekens lang zijn',
    };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
    },
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  return {
    success: true,
    message: 'Controleer je e-mail om je account te bevestigen',
  };
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const redirectTo = formData.get('redirect') as string | null;

  if (!email || !password) {
    return {
      error: 'E-mail en wachtwoord zijn verplicht',
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  // Check onboarding status before redirecting
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle();

    // If onboarding not completed, redirect to onboarding
    // Otherwise use redirectTo or default to dashboard
    const finalRedirect = preferences?.onboarding_completed
      ? redirectTo || '/dashboard'
      : '/onboarding';

    revalidatePath('/', 'layout');
    redirect(finalRedirect);
  } else {
    // Fallback (shouldn't happen after successful login)
    revalidatePath('/', 'layout');
    redirect(redirectTo || '/dashboard');
  }
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;

  if (!email) {
    return {
      error: 'E-mail is verplicht',
    };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/reset-password/confirm`,
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  return {
    success: true,
    message: 'Controleer je e-mail voor de wachtwoord reset link',
  };
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();

  const password = formData.get('password') as string;
  const passwordConfirm = formData.get('passwordConfirm') as string;

  if (!password || !passwordConfirm) {
    return {
      error: 'Alle velden zijn verplicht',
    };
  }

  if (password !== passwordConfirm) {
    return {
      error: 'Wachtwoorden komen niet overeen',
    };
  }

  if (password.length < 6) {
    return {
      error: 'Wachtwoord moet minimaal 6 tekens lang zijn',
    };
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
