export interface WorkflowConfigInterface {
  recursionLimit: number;
  maxSteps: number;
  timeoutMs: number;
  checkpointNamespace?: string;
}
