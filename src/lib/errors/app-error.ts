/**
 * Application Error Types
 * 
 * Centralized error handling with typed error codes and safe messages.
 * Safe messages are user-facing and do not expose sensitive data.
 */

export type AppErrorCode =
  | "AUTH_ERROR"
  | "VALIDATION_ERROR"
  | "DB_ERROR"
  | "AGENT_ERROR"
  | "RATE_LIMIT"
  | "CONFLICT";

/**
 * Application Error
 * 
 * Extends Error with a typed error code and safe user-facing message.
 * The safeMessage should not expose sensitive data (API keys, prompts, etc.).
 */
export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly safeMessage: string;

  constructor(
    code: AppErrorCode,
    safeMessage: string,
    cause?: unknown
  ) {
    super(safeMessage);
    this.name = "AppError";
    this.code = code;
    this.safeMessage = safeMessage;

    // Preserve original error as cause (for debugging)
    if (cause instanceof Error) {
      this.cause = cause;
    } else if (cause) {
      this.cause = new Error(String(cause));
    }
  }

  /**
   * Convert to a plain object for serialization
   */
  toJSON(): { code: AppErrorCode; message: string } {
    return {
      code: this.code,
      message: this.safeMessage,
    };
  }
}
