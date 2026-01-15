export interface WorkflowTraceMetadataInterface {
  threadId: string;
  tenantId: string;
  workflowType: string;
  environment: string;
  serviceName: string;
  timestamp: Date;
}
