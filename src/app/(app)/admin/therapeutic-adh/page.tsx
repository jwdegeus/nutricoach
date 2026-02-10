import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { listAdhReferenceValuesAction } from './actions/therapeuticAdh.actions';
import { TherapeuticAdhAdminClient } from './components/TherapeuticAdhAdminClient';

export async function generateMetadata() {
  const t = await getTranslations('admin.therapeuticAdh');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function AdminTherapeuticAdhPage() {
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

  const result = await listAdhReferenceValuesAction();
  const initialData = 'data' in result ? result.data : null;
  const loadError = 'error' in result ? result.error : null;

  return (
    <TherapeuticAdhAdminClient
      initialData={initialData}
      loadError={loadError}
    />
  );
}
