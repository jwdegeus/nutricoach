import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function readOnboardingFromMetadata(user: {
  user_metadata?: Record<string, unknown>;
}): boolean | null {
  const v = user.user_metadata?.onboarding_completed;
  if (v === true) return true;
  if (v === false) return false;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

async function getOnboardingCompleted(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('user_preferences')
    .select('onboarding_completed')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.onboarding_completed ?? false;
}

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
  let user: { id: string; user_metadata?: Record<string, unknown> } | null =
    null;
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

  // Authenticated user on auth pages: redirect to dashboard (no preferences query)
  if (user && isPublicRoute && pathname !== '/auth/callback') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Onboarding gating: metadata-first, DB fallback, write-back on fallback
  if (
    user &&
    !isPublicRoute &&
    pathname !== '/' &&
    !pathname.startsWith('/onboarding')
  ) {
    let onboardingCompleted: boolean;
    const fromMeta = readOnboardingFromMetadata(user);
    if (fromMeta !== null) {
      onboardingCompleted = fromMeta;
    } else {
      onboardingCompleted = await getOnboardingCompleted(supabase, user.id);
      // Write back to metadata so next request is DB-free (best-effort)
      supabase.auth
        .updateUser({
          data: {
            ...user.user_metadata,
            onboarding_completed: onboardingCompleted,
          },
        })
        .catch(() => {});
    }
    if (!onboardingCompleted) {
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
