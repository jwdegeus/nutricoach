/**
 * Recipe Draft Types
 *
 * Type definitions for recipe drafts extracted from external sources.
 * These are intermediate representations before finalization.
 */

/**
 * Recipe draft ingredient
 */
export type RecipeDraftIngredient = {
  text: string;
};

/**
 * Recipe draft step/instruction
 */
export type RecipeDraftStep = {
  text: string;
};

/**
 * Recipe draft
 *
 * Minimal representation of a recipe extracted from external sources.
 * This is an intermediate format before finalization into the database.
 */
export type RecipeDraft = {
  title: string;
  description?: string;
  servings?: string;
  ingredients: RecipeDraftIngredient[];
  steps: RecipeDraftStep[];
  sourceUrl: string;
  sourceLanguage?: string;
  imageUrl?: string; // URL to recipe image
  prepTimeMinutes?: number; // Preparation time in minutes
  cookTimeMinutes?: number; // Cooking time in minutes
  totalTimeMinutes?: number; // Total time in minutes
};

/**
 * Diagnostics for recipe extraction
 */
export type RecipeExtractionDiagnostics = {
  jsonLdBlocksFound: number;
  recipesFound: number;
};
