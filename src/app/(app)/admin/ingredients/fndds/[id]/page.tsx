import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { redirect, notFound } from 'next/navigation';
import { FnddsIngredientDetailPageClient } from './FnddsIngredientDetailPageClient';
import { loadFnddsForEdit } from '../loadFnddsForEdit';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const metadata = {
  title: 'FNDDS-ingrediënt | NutriCoach Admin',
  description: 'Bewerk FNDDS-ingrediënt (zelfde velden als NEVO)',
};

export default async function FnddsIngredientDetailPage({ params }: PageProps) {
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
  const fdcId = parseInt(id, 10);
  if (Number.isNaN(fdcId)) {
    notFound();
  }

  const item = await loadFnddsForEdit(supabase, fdcId);
  if (!item) {
    notFound();
  }

  return <FnddsIngredientDetailPageClient id={id} item={item} />;
}
