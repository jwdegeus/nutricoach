import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import {
  getAllDietTypes,
  type DietTypeOutput,
} from '@/src/app/(app)/settings/actions/diet-admin.actions';
import { AdminDashboardClient } from './components/AdminDashboardClient';

export const metadata = {
  title: 'Admin Dashboard | NutriCoach Admin',
  description: 'Admin beheer dashboard',
};

async function getAdminStats() {
  const supabase = await createClient();

  // Get diet types count
  const dietTypesResult = await getAllDietTypes();
  const dietTypes = 'data' in dietTypesResult ? dietTypesResult.data : [];
  const activeDietTypes = dietTypes.filter(
    (dt: DietTypeOutput) => dt.isActive,
  ).length;
  const totalDietTypes = dietTypes.length;

  // Get recipe sources count
  const { data: sources } = await supabase
    .from('recipe_sources')
    .select('id, is_system, usage_count', { count: 'exact' });

  const totalSources = sources?.length || 0;
  const systemSources = sources?.filter((s) => s.is_system).length || 0;
  const userSources = totalSources - systemSources;
  const totalUsage =
    sources?.reduce((sum, s) => sum + (s.usage_count || 0), 0) || 0;

  // Get NEVO and custom ingredients count
  const [{ count: nevoCount }, { count: customCount }] = await Promise.all([
    supabase.from('nevo_foods').select('*', { count: 'exact', head: true }),
    supabase.from('custom_foods').select('*', { count: 'exact', head: true }),
  ]);

  return {
    dietTypes: {
      total: totalDietTypes,
      active: activeDietTypes,
      inactive: totalDietTypes - activeDietTypes,
    },
    recipeSources: {
      total: totalSources,
      system: systemSources,
      user: userSources,
      totalUsage,
    },
    ingredients: {
      nevo: nevoCount ?? 0,
      custom: customCount ?? 0,
    },
  };
}

export default async function AdminDashboardPage() {
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

  const stats = await getAdminStats();

  return <AdminDashboardClient stats={stats} />;
}
