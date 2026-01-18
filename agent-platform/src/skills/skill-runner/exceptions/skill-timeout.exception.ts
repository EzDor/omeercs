import { SkillErrorType, SkillException } from './skill.exception';

/**
 * Exception thrown when skill execution exceeds its timeout
 */
export class SkillTimeoutException extends SkillException {
  constructor(
    public readonly skillId: string,
    public readonly timeoutMs: number,
    public readonly elapsedMs?: number,
  ) {
    super(SkillErrorType.TIMEOUT, 'TIMEOUT', `Skill '${skillId}' timed out after ${timeoutMs}ms`, {
      skillId,
      timeoutMs,
      elapsedMs,
    });
  }
}
