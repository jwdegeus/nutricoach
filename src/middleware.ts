import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>,
        ) {
          cookiesToSet.forEach(
            ({
              name,
              value,
            }: {
              name: string;
              value: string;
              options?: Record<string, unknown>;
            }) => {
              request.cookies.set(name, value);
            },
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }: {
              name: string;
              value: string;
              options?: Record<string, unknown>;
            }) => supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session if expired - required for Server Components
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    // AuthRetryableFetchError / "Failed to fetch" = transient network failure
    // Let the request through so the app still loads; next request may succeed
    const isRetryable =
      err instanceof Error &&
      (err.name === 'AuthRetryableFetchError' ||
        err.message === 'Failed to fetch');
    if (isRetryable) return supabaseResponse;
    throw err;
  }

  const { pathname } = request.nextUrl;

  // Cron/worker endpoints: no session; auth is via x-cron-secret in the route
  if (pathname.startsWith('/api/cron')) {
    return supabaseResponse;
  }

  // Define public routes that don't require authentication
  const publicRoutes = [
    '/login',
    '/register',
    '/reset-password',
    '/auth/callback',
  ];
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route),
  );

  // If user is not authenticated and trying to access protected route
  if (!user && !isPublicRoute && pathname !== '/') {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // If user is authenticated and trying to access auth pages, check onboarding first
  if (user && isPublicRoute && pathname !== '/auth/callback') {
    // Check onboarding status before redirecting
    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle();

    // Redirect to onboarding if not completed, otherwise to dashboard
    const redirectPath = preferences?.onboarding_completed
      ? '/dashboard'
      : '/onboarding';
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  // Onboarding gating: check if user has completed onboarding
  // Only apply to (app) routes, not to onboarding page itself or auth routes
  if (
    user &&
    !isPublicRoute &&
    pathname !== '/' &&
    !pathname.startsWith('/onboarding')
  ) {
    // Lightweight check: only fetch onboarding_completed flag
    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle();

    // If onboarding is not completed, redirect to onboarding
    if (!preferences?.onboarding_completed) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
