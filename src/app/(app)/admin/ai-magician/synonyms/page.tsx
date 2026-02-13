import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { isAdmin } from '@/src/lib/auth/roles';
import { MagicianIngredientSynonymsClient } from './components/MagicianIngredientSynonymsClient';
import {
  listMagicianIngredientSynonymsAction,
  type MagicianIngredientSynonymRow,
} from '../actions/magicianIngredientSynonyms.actions';

export const metadata = {
  title: 'AI Magician Synoniemen | NutriCoach Admin',
  description: 'Beheer ingredient synoniemen voor de AI Magician',
};

export default async function AiMagicianSynonymsPage() {
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

  const result = await listMagicianIngredientSynonymsAction();
  const initialData: MagicianIngredientSynonymRow[] =
    'data' in result ? result.data : [];
  const loadError = 'error' in result ? result.error : null;

  return (
    <MagicianIngredientSynonymsClient
      initialData={initialData}
      loadError={loadError}
    />
  );
}
