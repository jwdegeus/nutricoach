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
