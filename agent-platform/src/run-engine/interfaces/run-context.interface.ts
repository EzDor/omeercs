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

  baseRunId?: string;
  baseRunOutputs?: Map<string, StepOutput>;
  baseRunArtifacts?: Map<string, string[]>;
}

export interface CreateRunContextParams {
  runId: string;
  tenantId: string;
  workflowName: string;
  triggerPayload: Record<string, unknown>;
  baseRunId?: string;
  baseRunOutputs?: Map<string, StepOutput>;
  baseRunArtifacts?: Map<string, string[]>;
}

export function createRunContext(params: CreateRunContextParams): RunContext {
  return {
    runId: params.runId,
    tenantId: params.tenantId,
    workflowName: params.workflowName,
    triggerPayload: params.triggerPayload,
    stepOutputs: new Map(),
    artifacts: new Map(),
    baseRunId: params.baseRunId,
    baseRunOutputs: params.baseRunOutputs,
    baseRunArtifacts: params.baseRunArtifacts,
  };
}
