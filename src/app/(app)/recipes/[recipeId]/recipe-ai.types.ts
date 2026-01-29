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
  /** Intro-tekst bovenaan de aangepaste versie (bv. "Om dit recept Wahls Paleo proof te maken..."). */
  intro?: string;
  /** Bullets met gezondheidsvoordelen binnen het dieet ("Waarom dit werkt"). */
  whyThisWorks?: string[];
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
 * Keuze per violation: toegestaan alternatief gebruiken, vervangen door substitute, of schrappen.
 */
export type ViolationChoice = 'use_allowed' | 'substitute' | 'remove';

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
    /** Per violation-index: keuze (Kies X / Vervang door Y / Schrappen). Lengte = violations.length. */
    violationChoices?: Array<{ choice: ViolationChoice; substitute?: string }>;
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
  /** Toegestaan alternatief in dezelfde regel (bv. "olijfolie" in "olijfolie of boter") – voor keuze "Kies X" */
  allowedAlternativeInText?: string;
  /** Verboden term die gematcht is (bv. "butter") – voor weergave en substitutie */
  matchedForbiddenTerm?: string;
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
    /** Intro-tekst bovenaan (Gemini "chef" uitleg). */
    intro?: string;
    /** Waarom dit werkt voor het dieet (bullets). */
    whyThisWorks?: string[];
  };
  confidence?: number;
  openQuestions?: string[];
  /** Guard Rails vNext diagnostics (shadow mode, optional) */
  diagnostics?: {
    guardrailsVnext?: GuardrailsVNextDiagnostics;
  };
};

/**
 * Structured output from Gemini recipe adaptation (responseMimeType: application/json).
 * Gebruikt in gemini-recipe-adaptation.service voor type-veilige mapping.
 */
export type GeminiRecipeAdaptationResponse = {
  intro: string;
  adapted_ingredients: Array<{
    name: string;
    amount: string;
    unit: string;
    note: string;
  }>;
  adapted_steps: string[];
  why_this_works: string[];
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
