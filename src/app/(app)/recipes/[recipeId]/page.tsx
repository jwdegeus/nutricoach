import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { RecipeDetailPageClientLoader } from './components/RecipeDetailPageClientLoader';

export const metadata: Metadata = {
  title: 'Recept Details | NutriCoach',
  description: 'Bekijk details van een recept',
};

// Prevent automatic revalidation and caching issues
export const dynamic = 'force-dynamic';
export const revalidate = false;
export const fetchCache = 'force-no-store';

type PageProps = {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ source?: string }>;
};

/**
 * Recipe detail page - client-side rendering to avoid POST request loops
 */
export default async function RecipeDetailPage({
  params,
  searchParams,
}: PageProps) {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { recipeId } = await params;
  const { source } = await searchParams;
  const mealSource = (source === 'gemini' ? 'gemini' : 'custom') as
    | 'custom'
    | 'gemini';

  // Validate recipeId
  if (!recipeId || recipeId === 'undefined') {
    redirect('/recipes');
  }

  return (
    <RecipeDetailPageClientLoader mealId={recipeId} mealSource={mealSource} />
  );
}
