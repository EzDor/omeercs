import { Logger } from '@nestjs/common';
import { SkillPolicy, SecretsAccessor } from './skill-policy.interface';

/**
 * Basic skill execution context (existing pattern)
 */
export interface SkillExecutionContext {
  tenantId: string;
  executionId: string;
  skillId: string;
  provider?: string;
}

/**
 * Enhanced execution context with additional runtime resources
 * Extends the basic context with workspace, logging, secrets, and policy
 */
export interface EnhancedSkillExecutionContext extends SkillExecutionContext {
  /** Unique run identifier (UUID) for this execution */
  runId: string;
  /** Dedicated workspace directory path for this execution */
  workspaceDir: string;
  /** Base URI for artifact storage (e.g., file:///tmp/artifacts/{runId}/) */
  artifactBaseUri: string;
  /** Scoped logger for this execution */
  logger: Logger;
  /** Secret values accessor */
  secrets: SecretsAccessor;
  /** Policy constraints from skill descriptor */
  policy: SkillPolicy;
  /** Cancellation signal for timeout handling */
  signal?: AbortSignal;
}

/**
 * Options for skill execution
 */
export interface SkillExecutionOptions {
  /** Specific version to execute (defaults to latest) */
  version?: string;
  /** Override the default provider */
  provider?: string;
  /** Override the skill's timeout (in ms) */
  timeout_ms?: number;
}
