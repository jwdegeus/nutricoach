import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/src/lib/supabase/server';
import { PantrySettingsPageClient } from '../components/PantrySettingsPageClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pantry');
  return {
    title: `${t('settingsTitle')} | NutriCoach`,
    description: t('settingsDescription'),
  };
}

export default async function PantrySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <PantrySettingsPageClient />;
}
