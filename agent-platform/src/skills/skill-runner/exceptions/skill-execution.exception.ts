import { SkillErrorType, SkillException } from './skill.exception';

/**
 * Exception thrown when skill execution fails due to handler error
 */
export class SkillExecutionException extends SkillException {
  constructor(
    message: string,
    public readonly cause?: Error,
    details?: Record<string, unknown>,
  ) {
    super(SkillErrorType.EXECUTION, 'EXECUTION_ERROR', message, {
      ...details,
      cause: cause?.message,
      stack: cause?.stack,
    });
  }
}
