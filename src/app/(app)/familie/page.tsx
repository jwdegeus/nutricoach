import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { FamilieListClient } from './components/FamilieListClient';

export const metadata: Metadata = {
  title: 'Familie | NutriCoach',
  description: 'Beheer familieleden en hun persoonlijke instellingen',
};

export default async function FamiliePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <FamilieListClient />
    </div>
  );
}
