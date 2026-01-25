import { SkillResult } from '@agentic-template/dto/src/skills/skill-result.interface';

/**
 * Context passed to skill handlers during execution
 */
export interface SkillExecutionContext {
  /** Tenant ID for multi-tenancy */
  tenantId: string;
  /** Unique execution ID for tracing */
  executionId: string;
  /** Skill ID being executed */
  skillId: string;
  /** Optional provider override */
  provider?: string;
}

/**
 * Base interface for all skill handlers
 */
export interface SkillHandler<TInput = unknown, TOutput = unknown> {
  /**
   * Execute the skill with the given input
   * @param input - The validated input matching the skill's input_schema
   * @param context - Execution context including tenant and tracing info
   * @returns SkillResult with output data and artifacts
   */
  execute(input: TInput, context: SkillExecutionContext): Promise<SkillResult<TOutput>>;
}

/**
 * Registry entry for a skill handler
 */
export interface SkillHandlerRegistryEntry {
  skillId: string;
  handler: SkillHandler;
}
