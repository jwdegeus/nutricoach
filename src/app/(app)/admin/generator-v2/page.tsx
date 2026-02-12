import { redirect } from 'next/navigation';
import { isAdmin } from '@/src/lib/auth/roles';
import { GeneratorV2Client } from './components/GeneratorV2Client';

export const metadata = {
  title: 'Generator v2 | NutriCoach Admin',
  description:
    'Plan generator v2-instellingen (database-eerst, reuse, coverage)',
};

export default async function GeneratorV2AdminPage() {
  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) {
    redirect('/dashboard');
  }

  return <GeneratorV2Client />;
}
