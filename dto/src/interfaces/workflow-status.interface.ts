export enum WorkflowExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface WorkflowStatusInterface {
  jobId: string;
  executionId: string;
  workflowId: string;
  status: WorkflowExecutionStatus;
  currentStep?: string;
  completedSteps?: string[];
  remainingSteps?: string[];
  progress?: number;
  result?: Record<string, unknown>;
  error?: {
    category: string;
    message: string;
    step?: string;
    timestamp?: string;
  };
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  durationMs?: number;
  elapsedMs?: number;
  estimatedCompletionTime?: string;
  stepsExecuted?: number;
  memoryUsedMb?: number;
}
