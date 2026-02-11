/**
 * Canonical Ingredient Types
 *
 * Read-model types for the canonical ingredient catalog (view-based).
 * App identity is canonical_ingredients.id; refs are provenance only.
 */

export type CanonicalIngredientRefType = 'nevo' | 'fdc' | 'custom' | 'ai';

export type CanonicalIngredientRef = {
  type: CanonicalIngredientRefType;
  value: string;
};

export type CanonicalIngredient = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  refs: CanonicalIngredientRef[];
};
