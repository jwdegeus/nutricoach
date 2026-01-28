import type { Metadata } from 'next';
import { ClientOnlyApplicationLayout } from '@/src/components/app/ClientOnlyApplicationLayout';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: t('dashboardTitle'),
    description: t('dashboardDescription'),
  };
}

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Onboarding gating is handled in middleware.ts for better performance
  // Use ClientOnlyApplicationLayout to prevent hydration mismatches with Headless UI
  return <ClientOnlyApplicationLayout>{children}</ClientOnlyApplicationLayout>;
}
