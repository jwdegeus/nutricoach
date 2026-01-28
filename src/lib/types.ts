/**
 * Shared types for server actions
 */

/**
 * Validation error response type
 */
export type ActionError = {
  error: string;
};

/**
 * Success response type
 */
export type ActionSuccess<T> = {
  data: T;
};

/**
 * Result type for server actions
 * Either returns data or an error
 */
export type ActionResult<T> = ActionError | ActionSuccess<T>;

/**
 * Alternative result type used by settings/ingredient-categories actions:
 * ok/data on success, ok/error with code+message on failure.
 */
export type ActionResultWithOk<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
