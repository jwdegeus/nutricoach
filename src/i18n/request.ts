import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

/**
 * i18n locale resolution: NO Supabase in critical path.
 * User language preference is applied client-side (settings, account).
 * Server uses: URL locale > Accept-Language header > 'nl'.
 * This removes auth + user_preferences DB round trips from TTFB.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale) {
    try {
      const headersList = await headers();
      const acceptLanguage = headersList.get('accept-language') || 'nl';
      locale = acceptLanguage.startsWith('nl') ? 'nl' : 'en';
    } catch {
      locale = 'nl';
    }
  }

  if (locale !== 'nl' && locale !== 'en') {
    locale = 'nl';
  }

  // Default timeZone to avoid ENVIRONMENT_FALLBACK and server/client markup mismatches
  const timeZone = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Amsterdam';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone,
  };
});
