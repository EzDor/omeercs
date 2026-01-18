/**
 * Error types for skill execution failures
 */
export enum SkillErrorType {
  INPUT_VALIDATION = 'INPUT_VALIDATION',
  OUTPUT_VALIDATION = 'OUTPUT_VALIDATION',
  EXECUTION = 'EXECUTION',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Error codes matching the OpenAPI specification
 */
export type SkillErrorCode =
  | 'INPUT_VALIDATION_FAILED'
  | 'OUTPUT_VALIDATION_FAILED'
  | 'EXECUTION_ERROR'
  | 'POLICY_VIOLATION'
  | 'TIMEOUT'
  | 'SKILL_NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'HANDLER_NOT_FOUND';

/**
 * Base exception class for all skill-related errors
 */
export abstract class SkillException extends Error {
  constructor(
    public readonly errorType: SkillErrorType,
    public readonly errorCode: SkillErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper stack trace for where the error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to a serializable object for logging/response
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      errorType: this.errorType,
      errorCode: this.errorCode,
      details: this.details,
    };
  }
}
