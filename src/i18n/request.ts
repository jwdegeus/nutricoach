import { getRequestConfig } from 'next-intl/server';
import { createClient } from '@/src/lib/supabase/server';
import { cookies, headers } from 'next/headers';

export default getRequestConfig(async ({ requestLocale }) => {
  // Try to get locale from request first (URL-based)
  let locale = await requestLocale;

  // If no locale in URL, try to get from user preferences
  if (!locale) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: preferences } = await supabase
          .from('user_preferences')
          .select('language')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (preferences?.language) {
          locale = preferences.language;
        }
      }
    } catch (error) {
      console.error('Error loading user language preference:', error);
    }
  }

  // Fallback to Dutch (default) or English
  if (!locale) {
    try {
      // Check Accept-Language header
      const headersList = await headers();
      const acceptLanguage = headersList.get('accept-language') || 'nl';
      locale = acceptLanguage.startsWith('nl') ? 'nl' : 'en';
    } catch {
      // Default to Dutch if we can't read headers
      locale = 'nl';
    }
  }

  // Ensure locale is valid
  if (locale !== 'nl' && locale !== 'en') {
    locale = 'nl'; // Default to Dutch
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
