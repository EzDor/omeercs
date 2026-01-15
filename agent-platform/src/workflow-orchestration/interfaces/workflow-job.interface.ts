export interface WorkflowJobData {
  executionId: string;
  workflowId: string;
  workflowType: string;
  tenantId: string;
  input: Record<string, unknown>;
  checkpointId?: string;
  isRetry?: boolean;
}
