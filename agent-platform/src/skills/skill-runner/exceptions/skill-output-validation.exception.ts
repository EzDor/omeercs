import { SkillErrorType, SkillException } from './skill.exception';

/**
 * Schema violation error
 */
export interface SchemaViolation {
  path: string;
  message: string;
  keyword?: string;
}

/**
 * Exception thrown when skill output validation fails
 */
export class SkillOutputValidationException extends SkillException {
  constructor(
    public readonly violations: SchemaViolation[],
    message?: string,
  ) {
    super(SkillErrorType.OUTPUT_VALIDATION, 'OUTPUT_VALIDATION_FAILED', message || 'Output validation failed', { violations });
  }

  /**
   * Get a summary of all schema violations
   */
  getSummary(): string {
    return this.violations.map((v) => `${v.path}: ${v.message}`).join('; ');
  }
}
