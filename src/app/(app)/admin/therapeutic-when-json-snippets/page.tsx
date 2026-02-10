import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { listWhenJsonSnippetsAction } from './actions/therapeuticWhenJsonSnippets.actions';
import { TherapeuticWhenJsonSnippetsAdminClient } from './TherapeuticWhenJsonSnippetsAdminClient';

export default async function AdminTherapeuticWhenJsonSnippetsPage() {
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

  const result = await listWhenJsonSnippetsAction();
  const initialData = 'data' in result ? result.data : null;
  const loadError = 'error' in result ? result.error : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <TherapeuticWhenJsonSnippetsAdminClient
        initialData={initialData}
        loadError={loadError}
      />
    </div>
  );
}
