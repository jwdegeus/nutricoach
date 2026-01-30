import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { redirect, notFound } from 'next/navigation';
import { CustomIngredientEditPageClient } from './CustomIngredientEditPageClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const metadata = {
  title: 'NutriCoach ingrediënt bewerken | NutriCoach Admin',
  description: 'Bewerk NutriCoach ingrediënt en verrijk gegevens met AI',
};

export default async function CustomIngredientEditPage({ params }: PageProps) {
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
  const { data, error } = await supabase
    .from('custom_foods')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    notFound();
  }

  return (
    <CustomIngredientEditPageClient
      id={id}
      initialData={data as Record<string, unknown>}
    />
  );
}
