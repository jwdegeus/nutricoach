import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { getTherapeuticProtocolEditorAction } from '../../../actions/therapeuticProtocolEditor.actions';
import { SupplementEditPageClient } from '../../SupplementEditPageClient';

export const metadata = {
  title: 'Supplement bewerken | NutriCoach Admin',
  description: 'Supplement en regels bewerken',
};

type PageProps = {
  params: Promise<{ protocolId: string; supplementId: string }>;
};

export default async function EditSupplementPage({ params }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');
  if (!(await isAdmin())) redirect('/dashboard');

  const { protocolId, supplementId } = await params;
  const result = await getTherapeuticProtocolEditorAction({ protocolId });

  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-950/20">
          <p className="text-sm text-red-800 dark:text-red-200">
            {result.error}
          </p>
        </div>
      </div>
    );
  }

  if (result.data === null) notFound();

  const supplement = result.data.supplements.find((s) => s.id === supplementId);
  if (!supplement) notFound();

  const rulesForSupplement = (result.data.rules ?? []).filter(
    (r) => r.supplement_key === supplement.supplement_key,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <SupplementEditPageClient
        protocol={result.data.protocol}
        supplement={supplement}
        rules={rulesForSupplement}
        snippets={result.data.snippets ?? []}
      />
    </div>
  );
}
