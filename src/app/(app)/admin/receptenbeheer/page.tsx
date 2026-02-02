import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { ReceptenbeheerClient } from './components/ReceptenbeheerClient';

export const metadata = {
  title: 'Receptenbeheer | NutriCoach Admin',
  description:
    'Beheer recept bronnen en catalog opties (keuken, proteïne-type)',
};

const VALID_TABS = ['bronnen', 'keukens'] as const;
type TabId = (typeof VALID_TABS)[number];

function parseTab(tab: string | string[] | undefined): TabId | undefined {
  const s =
    typeof tab === 'string' ? tab : Array.isArray(tab) ? tab[0] : undefined;
  if (s && VALID_TABS.includes(s as TabId)) return s as TabId;
  return undefined;
}

type ReceptenbeheerPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReceptenbeheerPage({
  searchParams,
}: ReceptenbeheerPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const initialTab = parseTab(params.tab);

  return <ReceptenbeheerClient initialTab={initialTab} />;
}
