import { SkillErrorType, SkillException } from './skill.exception';

/**
 * Field-level validation error
 */
export interface ValidationFieldError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Exception thrown when skill input validation fails
 */
export class SkillInputValidationException extends SkillException {
  constructor(
    public readonly fieldErrors: ValidationFieldError[],
    message?: string,
  ) {
    super(SkillErrorType.INPUT_VALIDATION, 'INPUT_VALIDATION_FAILED', message || 'Input validation failed', { fieldErrors });
  }

  /**
   * Get a summary of all validation errors
   */
  getSummary(): string {
    return this.fieldErrors.map((e) => `${e.field}: ${e.message}`).join('; ');
  }
}
