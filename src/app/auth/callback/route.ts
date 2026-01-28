import { createClient } from '@/src/lib/supabase/server';
import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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
        // Otherwise use the next parameter or default to dashboard
        const redirectPath = preferences?.onboarding_completed
          ? next || '/dashboard'
          : '/onboarding';

        return NextResponse.redirect(new URL(redirectPath, requestUrl.origin));
      }

      // Fallback to next or dashboard if no user
      return NextResponse.redirect(
        new URL(next || '/dashboard', requestUrl.origin),
      );
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(
    new URL('/login?error=Could not authenticate', requestUrl.origin),
  );
}
