export interface WorkflowContextInterface {
  threadId: string;
  checkpointId?: string;
  userId?: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
}
