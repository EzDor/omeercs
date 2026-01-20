import { RunContext } from './run-context.interface';

export interface CachePolicy {
  enabled: boolean;
  scope: 'global' | 'run_only';
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

export interface StepSpec {
  stepId: string;
  skillId: string;
  dependsOn: string[];
  inputSelector: (ctx: RunContext) => Record<string, unknown>;
  cachePolicy: CachePolicy;
  retryPolicy: RetryPolicy;
  description?: string;
}
