import { SkillErrorType, SkillException } from './skill.exception';

/**
 * Policy violation details
 */
export interface PolicyViolationDetail {
  policy: string;
  constraint: string;
  actual?: unknown;
}

/**
 * Exception thrown when skill execution violates its policy
 */
export class SkillPolicyViolationException extends SkillException {
  constructor(
    public readonly violation: PolicyViolationDetail,
    message?: string,
  ) {
    super(SkillErrorType.POLICY_VIOLATION, 'POLICY_VIOLATION', message || `Policy violation: ${violation.policy}`, { violation });
  }
}
