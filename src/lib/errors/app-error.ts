/**
 * Application Error Types
 *
 * Centralized error handling with typed error codes and safe messages.
 * Safe messages are user-facing and do not expose sensitive data.
 */

export type AppErrorCode =
  | 'AUTH_ERROR'
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'DB_ERROR'
  | 'AGENT_ERROR'
  | 'RATE_LIMIT'
  | 'CONFLICT'
  | 'GUARDRAILS_VIOLATION'
  | 'MEAL_LOCKED'
  | 'INSUFFICIENT_ALLOWED_INGREDIENTS'
  | 'MEAL_PLAN_SANITY_FAILED'
  | 'MEAL_PLAN_CONFIG_INVALID';

/** Ontbrekende FORCE-categorie bij quotum-falen (voor substitutie/“voeg toe”-feedback) */
export type ForceDeficitItem = {
  categoryCode: string;
  categoryNameNl: string;
  minPerDay?: number;
  minPerWeek?: number;
};

/**
 * Guardrails violation details
 */
export type GuardrailsViolationDetails = {
  outcome: 'blocked';
  reasonCodes: string[];
  contentHash: string;
  rulesetVersion?: number;
  /** Bij DIET_LOGIC_VIOLATION wegens FORCE-quotum: ontbrekende categorieën voor “voeg toe”-feedback */
  forceDeficits?: ForceDeficitItem[];
};

/**
 * Application Error
 *
 * Extends Error with a typed error code and safe user-facing message.
 * The safeMessage should not expose sensitive data (API keys, prompts, etc.).
 */
export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly safeMessage: string;
  public readonly guardrailsDetails?: GuardrailsViolationDetails;
  /** Optional payload for observability (e.g. retryReason: 'POOL_EMPTY' for INSUFFICIENT_ALLOWED_INGREDIENTS) */
  public readonly details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    safeMessage: string,
    causeOrDetails?: unknown,
  ) {
    super(safeMessage);
    this.name = 'AppError';
    this.code = code;
    this.safeMessage = safeMessage;

    // Check if causeOrDetails is guardrails details
    if (
      code === 'GUARDRAILS_VIOLATION' &&
      causeOrDetails &&
      typeof causeOrDetails === 'object' &&
      'outcome' in causeOrDetails &&
      'reasonCodes' in causeOrDetails &&
      'contentHash' in causeOrDetails
    ) {
      this.guardrailsDetails = causeOrDetails as GuardrailsViolationDetails;
    } else if (causeOrDetails instanceof Error) {
      // Preserve original error as cause (for debugging)
      this.cause = causeOrDetails;
    } else if (
      causeOrDetails &&
      typeof causeOrDetails === 'object' &&
      !Array.isArray(causeOrDetails)
    ) {
      this.details = causeOrDetails as Record<string, unknown>;
    } else if (causeOrDetails) {
      this.cause = new Error(String(causeOrDetails));
    }
  }

  /**
   * Convert to a plain object for serialization
   */
  toJSON(): {
    code: AppErrorCode;
    message: string;
    details?: GuardrailsViolationDetails | Record<string, unknown>;
  } {
    return {
      code: this.code,
      message: this.safeMessage,
      ...(this.guardrailsDetails && { details: this.guardrailsDetails }),
      ...(this.details && !this.guardrailsDetails && { details: this.details }),
    };
  }
}
