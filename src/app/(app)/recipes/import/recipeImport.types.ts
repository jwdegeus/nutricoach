/**
 * Recipe Import Types
 * 
 * Type definitions for recipe import jobs.
 */

/**
 * Recipe import status enum
 */
export type RecipeImportStatus =
  | "uploaded"
  | "processing"
  | "ready_for_review"
  | "failed"
  | "finalized";

/**
 * Source image metadata
 */
export type SourceImageMeta = {
  filename?: string;
  size?: number; // bytes
  mimetype?: string;
  width?: number;
  height?: number;
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
  sourceLocale?: string;
  targetLocale?: string;
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
