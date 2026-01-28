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
  | {
      type: 'analysis_only';
      data: {
        violations: ViolationDetail[];
        summary: string;
        recipeName: string;
        noRulesConfigured?: boolean;
      };
    }
  | {
      type: 'loading_rewrite';
      data: {
        violations: ViolationDetail[];
        summary: string;
        recipeName: string;
        noRulesConfigured?: boolean;
      };
    }
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
  /** Bij twee-fase flow: violations uit eerdere analyse-only; dan wordt analyse overgeslagen. */
  existingAnalysis?: {
    violations: ViolationDetail[];
    recipeName: string;
  };
};

/**
 * Input voor analyse-only (fase 1 van twee-fase flow)
 */
export type GetRecipeAnalysisInput = {
  recipeId: string;
  dietId: string;
};

/**
 * Resultaat van analyse-only; geen rewrite.
 * noRulesConfigured: true wanneer het dieet geen dieetregels heeft → UI toont "N.v.t." i.p.v. afwijkingen.
 */
export type GetRecipeAnalysisResult =
  | {
      ok: true;
      data: {
        violations: ViolationDetail[];
        summary: string;
        recipeName: string;
        noRulesConfigured?: boolean;
      };
    }
  | { ok: false; error: { code: string; message: string } };

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
 * Guard Rails vNext diagnostics (shadow mode)
 */
export type GuardrailsVNextDiagnostics = {
  rulesetVersion: number;
  contentHash: string;
  outcome: 'allowed' | 'blocked' | 'warned';
  ok: boolean;
  reasonCodes: string[];
  counts: {
    matches: number;
    applied: number;
  };
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
  /** Guard Rails vNext diagnostics (shadow mode, optional) */
  diagnostics?: {
    guardrailsVnext?: GuardrailsVNextDiagnostics;
  };
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
      outcome: 'success';
      adaptation: RecipeAdaptationDraft;
      meta: AdaptationMeta;
    }
  | {
      outcome: 'empty';
      reason: 'NO_DIET_SELECTED';
    }
  | {
      outcome: 'error';
      message: string;
      code: 'INVALID_INPUT' | 'INTERNAL_ERROR';
    };
