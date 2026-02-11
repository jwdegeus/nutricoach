import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { redirect, notFound } from 'next/navigation';
import { getCanonicalIngredientIdsByNevoCodes } from '@/src/lib/agents/meal-planner/mealPlannerShopping.service';
import { NevoIngredientDetailPageClient } from './NevoIngredientDetailPageClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const metadata = {
  title: 'NEVO-ingrediënt | NutriCoach Admin',
  description: 'Bekijk NEVO-ingrediënt (alleen-lezen)',
};

export default async function NevoIngredientDetailPage({ params }: PageProps) {
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

  const { id } = await params;
  const nevoId = parseInt(id, 10);
  if (Number.isNaN(nevoId)) {
    notFound();
  }

  const { data, error } = await supabase
    .from('nevo_foods')
    .select('*')
    .eq('id', nevoId)
    .single();

  if (error || !data) {
    notFound();
  }

  const nevoCode = String((data as { nevo_code?: number }).nevo_code ?? id);
  const canonicalMap = await getCanonicalIngredientIdsByNevoCodes([nevoCode]);
  const canonicalIngredientId = canonicalMap.get(nevoCode) ?? null;

  const item = { ...data, source: 'nevo' as const };

  return (
    <NevoIngredientDetailPageClient
      id={id}
      item={item as Record<string, unknown> & { source: 'nevo' }}
      canonicalIngredientId={canonicalIngredientId}
    />
  );
}
