/**
 * Recipe Import Types
 *
 * Type definitions for recipe import jobs.
 */

/**
 * Recipe import status enum
 */
export type RecipeImportStatus =
  | 'uploaded'
  | 'processing'
  | 'ready_for_review'
  | 'failed'
  | 'finalized';

/**
 * Source image metadata
 */
export type SourceImageMeta = {
  filename?: string;
  size?: number; // bytes
  mimetype?: string;
  width?: number;
  height?: number;
  // For URL imports
  url?: string;
  domain?: string;
  source?: string;
  imageUrl?: string; // Original external image URL
  savedImageUrl?: string; // Locally saved image URL (preferred for display)
  savedImagePath?: string; // Locally saved image path
};

/**
 * Recipe import job record from database
 */
export type RecipeImportJob = {
  id: string;
  userId: string;
  status: RecipeImportStatus;
  sourceImagePath: string | null;
  sourceImageMeta: SourceImageMeta | null;
  sourceLocale: string | null;
  targetLocale: string | null;
  rawOcrText: string | null;
  geminiRawJson: any | null;
  extractedRecipeJson: any | null;
  originalRecipeJson: any | null; // Original recipe in source language (before translation)
  validationErrorsJson: any | null;
  confidenceOverall: number | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  recipeId: string | null; // ID of finalized recipe in custom_meals
};

/**
 * Create recipe import input
 */
export type CreateRecipeImportInput = {
  sourceImagePath?: string;
  sourceImageMeta?: SourceImageMeta;
  sourceLocale?: string | null;
  targetLocale?: string | null;
};

/**
 * Load recipe import input
 */
export type LoadRecipeImportInput = {
  jobId: string;
};

/**
 * Update recipe import status input
 */
export type UpdateRecipeImportStatusInput = {
  jobId: string;
  status: RecipeImportStatus;
  errorMessage?: string;
};

/**
 * Import recipe from URL input
 */
export type ImportRecipeFromUrlInput = {
  url: string;
};

/**
 * Import recipe from URL result (success)
 * job: full job with translated extracted_recipe_json, so client can show it without refetch
 */
export type ImportRecipeFromUrlSuccess = {
  ok: true;
  jobId?: string;
  recipeId?: string;
  job?: RecipeImportJob;
};

/**
 * Import recipe from URL result (error)
 */
export type ImportRecipeFromUrlError = {
  ok: false;
  errorCode: 'INVALID_URL' | 'UNAUTHORIZED' | 'INTERNAL';
  message: string;
};

/**
 * Import recipe from URL result (discriminated union)
 */
export type ImportRecipeFromUrlResult =
  | ImportRecipeFromUrlSuccess
  | ImportRecipeFromUrlError;
