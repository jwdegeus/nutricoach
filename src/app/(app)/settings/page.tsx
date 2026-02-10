import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { SettingsPageContent } from './SettingsPageContent';

export const metadata: Metadata = {
  title: 'Instellingen | NutriCoach',
  description: 'Beheer je applicatie instellingen',
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const admin = await isAdmin();

  return <SettingsPageContent user={user} isAdmin={!!admin} />;
}
