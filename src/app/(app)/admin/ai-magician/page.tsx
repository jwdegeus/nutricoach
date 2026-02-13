import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { AiMagicianOverridesClient } from './components/AiMagicianOverridesClient';
import {
  listMagicianOverridesAction,
  type MagicianOverrideRow,
} from './actions/magicianOverrides.actions';

export const metadata = {
  title: 'AI Magician Overrides | NutriCoach Admin',
  description: 'Beheer false-positive uitsluitingen voor de AI Magician',
};

export default async function AiMagicianAdminPage() {
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

  const result = await listMagicianOverridesAction();
  const initialData: MagicianOverrideRow[] =
    'data' in result ? result.data : [];
  const loadError = 'error' in result ? result.error : null;

  return (
    <AiMagicianOverridesClient
      initialData={initialData}
      loadError={loadError}
    />
  );
}
