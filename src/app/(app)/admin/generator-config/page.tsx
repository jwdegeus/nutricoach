import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { getGeneratorConfigAdmin } from './actions/generatorConfig.actions';
import { GeneratorConfigClient } from './components/GeneratorConfigClient';

export const metadata = {
  title: 'Generatorconfiguratie | NutriCoach Admin',
  description:
    'Beheer templates, pools en instellingen voor de weekmenu-generator',
};

export default async function AdminGeneratorConfigPage() {
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

  const result = await getGeneratorConfigAdmin();
  const initialData = 'data' in result ? result.data : null;
  const loadError = 'error' in result ? result.error : null;

  return (
    <GeneratorConfigClient initialData={initialData} loadError={loadError} />
  );
}
