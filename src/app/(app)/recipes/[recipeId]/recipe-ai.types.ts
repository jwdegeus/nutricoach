/**
 * Types for Recipe AI Magician feature
 * These types match the expected backend contract structure
 */

// ============================================================================
// Client-side UI State Types (for frontend component state management)
// ============================================================================

export type Violation = {
  ingredientName: string;
  rule: string;
  suggestion: string;
};

export type AdaptedIngredient = {
  name: string;
  quantity: string;
  unit?: string;
  note?: string;
};

export type AdaptedStep = {
  step: number;
  text: string;
};

export type RecipeAnalysis = {
  violations: Violation[];
  hasDiet: boolean;
};

export type RecipeRewrite = {
  ingredients: AdaptedIngredient[];
  steps: AdaptedStep[];
};

export type RecipeAIData = {
  analysis: RecipeAnalysis;
  rewrite: RecipeRewrite | null;
};

export type RecipeAIState = 
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'empty'; reason: string }
  | { type: 'success'; data: RecipeAIData };

// ============================================================================
// Server Contract Types (for API/Server Action)
// ============================================================================

/**
 * Input for requesting recipe adaptation
 */
export type RequestRecipeAdaptationInput = {
  recipeId: string;
  dietId?: string;
  locale?: string;
};

/**
 * Violation with rule code/label for server response
 */
export type ViolationDetail = {
  ingredientName: string;
  ruleCode: string;
  ruleLabel: string;
  suggestion: string;
};

/**
 * Ingredient line for adapted recipe
 */
export type IngredientLine = {
  name: string;
  quantity: string;
  unit?: string;
  note?: string;
};

/**
 * Step line for adapted recipe
 */
export type StepLine = {
  step: number;
  text: string;
};

/**
 * Recipe adaptation draft from server
 */
export type RecipeAdaptationDraft = {
  analysis: {
    violations: ViolationDetail[];
    summary: string;
  };
  rewrite: {
    title: string;
    ingredients: IngredientLine[];
    steps: StepLine[];
  };
  confidence?: number;
  openQuestions?: string[];
};

/**
 * Metadata for adaptation response
 */
export type AdaptationMeta = {
  timestamp: string;
  recipeId: string;
  dietId?: string;
  locale?: string;
};

/**
 * Discriminated union for recipe adaptation result
 */
export type RequestRecipeAdaptationResult =
  | {
      outcome: "success";
      adaptation: RecipeAdaptationDraft;
      meta: AdaptationMeta;
    }
  | {
      outcome: "empty";
      reason: "NO_DIET_SELECTED";
    }
  | {
      outcome: "error";
      message: string;
      code: "INVALID_INPUT" | "INTERNAL_ERROR";
    };
