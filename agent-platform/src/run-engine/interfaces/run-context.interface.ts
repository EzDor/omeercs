/**
 * Output from a completed or skipped step
 */
export interface StepOutput {
  stepId: string;
  status: 'completed' | 'skipped' | 'failed';
  outputArtifactIds: string[];
  data?: Record<string, unknown>;
}

/**
 * Runtime context passed to step inputSelectors
 */
export interface RunContext {
  runId: string;
  tenantId: string;
  workflowName: string;
  triggerPayload: Record<string, unknown>;
  stepOutputs: Map<string, StepOutput>;
  artifacts: Map<string, string[]>; // stepId → artifactIds
}

/**
 * Create a new RunContext instance
 */
export function createRunContext(params: { runId: string; tenantId: string; workflowName: string; triggerPayload: Record<string, unknown> }): RunContext {
  return {
    ...params,
    stepOutputs: new Map(),
    artifacts: new Map(),
  };
}
