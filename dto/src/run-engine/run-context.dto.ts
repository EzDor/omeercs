export interface StepOutput {
  stepId: string;
  status: 'completed' | 'skipped' | 'failed';
  outputArtifactIds: string[];
  data?: Record<string, unknown>;
}

export interface RunContext {
  runId: string;
  tenantId: string;
  workflowName: string;
  triggerPayload: Record<string, unknown>;
  stepOutputs: Map<string, StepOutput>;
  artifacts: Map<string, string[]>;
}
