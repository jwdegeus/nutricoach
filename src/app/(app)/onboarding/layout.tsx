import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding | NutriCoach",
  description: "Stel je voorkeuren in voor NutriCoach",
};

/**
 * Onboarding layout - geen sidebar/header, fullscreen focus
 * Overschrijft de (app)/layout.tsx ApplicationLayout
 */
export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-100 px-4 py-8 dark:bg-zinc-900 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
