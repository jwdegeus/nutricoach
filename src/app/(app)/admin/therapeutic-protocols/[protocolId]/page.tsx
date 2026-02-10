import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { getTherapeuticProtocolEditorAction } from './actions/therapeuticProtocolEditor.actions';
import { TherapeuticProtocolEditorClient } from './components/TherapeuticProtocolEditorClient';

export const metadata = {
  title: 'Protocol bewerken | NutriCoach Admin',
  description: 'Targets en supplementen voor therapeutisch protocol',
};

type PageProps = {
  params: Promise<{ protocolId: string }>;
};

export default async function TherapeuticProtocolEditorPage({
  params,
}: PageProps) {
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

  const { protocolId } = await params;
  const result = await getTherapeuticProtocolEditorAction({ protocolId });

  if ('error' in result) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-950/20">
          <p className="text-sm text-red-800 dark:text-red-200">
            {result.error}
          </p>
        </div>
      </div>
    );
  }

  if (result.data === null) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <TherapeuticProtocolEditorClient initialData={result.data} />
    </div>
  );
}
