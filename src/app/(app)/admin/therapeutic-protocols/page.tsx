import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { listTherapeuticProtocolsAction } from './actions/therapeuticProtocols.actions';
import { TherapeuticProtocolsAdminClient } from './components/TherapeuticProtocolsAdminClient';

export async function generateMetadata() {
  const t = await getTranslations('admin.therapeuticProtocols');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function AdminTherapeuticProtocolsPage() {
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

  const result = await listTherapeuticProtocolsAction();
  const initialData = 'data' in result ? result.data : null;
  const loadError = 'error' in result ? result.error : null;

  return (
    <TherapeuticProtocolsAdminClient
      initialData={initialData}
      loadError={loadError}
    />
  );
}
