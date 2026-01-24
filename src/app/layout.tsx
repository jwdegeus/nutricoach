import type { Metadata } from "next";
import { ThemeProvider } from "@/src/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s - NutriCoach",
    default: "NutriCoach",
  },
  description: "NutriCoach - Nutrition Coaching Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="text-stone-950 antialiased lg:bg-stone-50 dark:bg-stone-950 dark:text-stone-50 dark:lg:bg-stone-900"
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="nutricoach-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
