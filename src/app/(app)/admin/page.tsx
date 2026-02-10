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

  // Get NEVO, custom, FNDDS en NEVO zonder categorie
  const [
    { count: nevoCount },
    { count: customCount },
    { count: fnddsCount },
    { data: withoutCategoryData },
  ] = await Promise.all([
    supabase.from('nevo_foods').select('*', { count: 'exact', head: true }),
    supabase.from('custom_foods').select('*', { count: 'exact', head: true }),
    supabase
      .from('fndds_survey_foods')
      .select('*', { count: 'exact', head: true }),
    supabase.rpc('get_nevo_without_category_count'),
  ]);

  const withoutCategoryCount =
    typeof withoutCategoryData === 'number'
      ? withoutCategoryData
      : Number(withoutCategoryData) || 0;

  const [
    templateRes,
    templateActiveRes,
    poolRes,
    protocolsRes,
    protocolsActiveRes,
    productSourceRes,
    productSourceActiveRes,
  ] = await Promise.all([
    supabase
      .from('meal_plan_templates')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('meal_plan_templates')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('meal_plan_pool_items')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('therapeutic_protocols')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('therapeutic_protocols')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('product_source_config')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('product_source_config')
      .select('id', { count: 'exact', head: true })
      .eq('is_enabled', true),
  ]);
  const generatorStats = {
    templatesTotal: templateRes.error ? 0 : (templateRes.count ?? 0),
    templatesActive: templateActiveRes.error
      ? 0
      : (templateActiveRes.count ?? 0),
    poolItems: poolRes.error ? 0 : (poolRes.count ?? 0),
  };
  const therapeuticProtocolsTotal = protocolsRes.error
    ? 0
    : (protocolsRes.count ?? 0);
  const therapeuticProtocolsActive = protocolsActiveRes.error
    ? 0
    : (protocolsActiveRes.count ?? 0);

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
      fndds: fnddsCount ?? 0,
      withoutCategory: withoutCategoryCount,
    },
    generator: generatorStats,
    therapeuticProtocols: {
      total: therapeuticProtocolsTotal,
      active: therapeuticProtocolsActive,
      inactive: therapeuticProtocolsTotal - therapeuticProtocolsActive,
    },
    productSources: {
      total: productSourceRes.error ? 0 : (productSourceRes.count ?? 0),
      enabled: productSourceActiveRes.error
        ? 0
        : (productSourceActiveRes.count ?? 0),
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
