/**
 * Haalt alle match-termen op voor gegeven ingredient-category codes.
 * Gebruikt voor "recepten voor ontbrekende categorieën" (force-deficit substitutie).
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';

/**
 * Retourneert alle term + synonym strings (lowercase) voor de opgegeven category codes.
 * Lege array als codes leeg zijn of geen items gevonden.
 */
export async function getTermsForCategoryCodes(
  categoryCodes: string[],
): Promise<string[]> {
  if (categoryCodes.length === 0) return [];

  const supabase = await createClient();
  const { data: categories, error } = await supabase
    .from('ingredient_categories')
    .select('code, ingredient_category_items(term, synonyms, is_active)')
    .in('code', categoryCodes);

  if (error || !categories) return [];

  const terms = new Set<string>();
  for (const cat of categories as Array<{
    code: string;
    ingredient_category_items?: Array<{
      term?: string;
      synonyms?: string[];
      is_active?: boolean;
    }>;
  }>) {
    const items = cat.ingredient_category_items ?? [];
    for (const it of items) {
      if (it.is_active === false) continue;
      const t = (it.term ?? '').trim().toLowerCase();
      if (t) terms.add(t);
      for (const s of it.synonyms ?? []) {
        const x = String(s).trim().toLowerCase();
        if (x) terms.add(x);
      }
    }
  }
  return Array.from(terms);
}

/**
 * Controleert of een ingrediëntnaam (displayName of name) matcht met één van de termen.
 */
function ingredientMatchesTerms(
  text: string | undefined,
  terms: string[],
): boolean {
  const n = (text ?? '').trim().toLowerCase();
  if (!n) return false;
  return terms.some((t) => n.includes(t) || t.includes(n) || n === t);
}

/**
 * Filtert meals op "bevat minstens één ingrediënt dat bij één van de termen hoort".
 * Werkt op meal.mealData.ingredientRefs en meal.mealData.ingredients.
 */
export function filterMealsByIngredientTerms<
  T extends {
    mealData?: {
      ingredientRefs?: Array<{ displayName?: string }>;
      ingredients?: Array<{ name?: string }>;
    };
  },
>(meals: T[], terms: string[]): T[] {
  if (terms.length === 0) return meals;
  return meals.filter((m) => {
    const data = m.mealData;
    if (!data) return false;
    const fromRefs = data.ingredientRefs?.some((r) =>
      ingredientMatchesTerms(r.displayName, terms),
    );
    if (fromRefs) return true;
    const fromLegacy = data.ingredients?.some((i) =>
      ingredientMatchesTerms(i.name, terms),
    );
    return !!fromLegacy;
  });
}
