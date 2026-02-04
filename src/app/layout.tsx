import type { Metadata } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ThemeProvider } from '@/src/components/theme-provider';
import { getLocale, getMessages, getTimeZone } from 'next-intl/server';
import { I18nProvider } from '@/src/components/i18n-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s - NutriCoach',
    default: 'NutriCoach',
  },
  description: 'NutriCoach - Nutrition Coaching Platform',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = await getTimeZone();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className="text-zinc-950 antialiased lg:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-50 dark:lg:bg-zinc-950"
    >
      <head>
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('nutricoach-theme');
                  var isDark = theme === 'dark' || 
                    (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  document.documentElement.classList.toggle('dark', isDark);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <I18nProvider locale={locale} messages={messages} timeZone={timeZone}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            storageKey="nutricoach-theme"
          >
            {children}
          </ThemeProvider>
        </I18nProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
