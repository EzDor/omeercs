import { RunContext } from './run-context.interface';

/**
 * Cache policy configuration for a workflow step
 */
export interface CachePolicy {
  enabled: boolean;
  scope: 'global' | 'run_only';
}

/**
 * Retry policy configuration for a workflow step
 */
export interface RetryPolicy {
  maxAttempts: number; // 1-5
  backoffMs: number; // Initial backoff (exponential)
}

/**
 * Step specification within a workflow definition
 */
export interface StepSpec {
  stepId: string;
  skillId: string;
  dependsOn: string[];
  inputSelector: (ctx: RunContext) => Record<string, unknown>;
  cachePolicy: CachePolicy;
  retryPolicy: RetryPolicy;
  description?: string;
}
