import { IsString, IsObject, IsOptional, IsUUID, IsEnum } from 'class-validator';

/**
 * Run status enum
 */
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Trigger type enum
 */
export type TriggerType = 'initial' | 'update';

/**
 * Summary of step statuses within a run
 */
export interface StepsSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  skipped: number;
  failed: number;
}

/**
 * Run error details
 */
export interface RunError {
  code: string;
  message: string;
  failedStepId?: string;
  timestamp: Date;
}

/**
 * Request to trigger a new workflow run
 */
export class TriggerRunRequest {
  @IsString()
  workflowName: string;

  @IsOptional()
  @IsString()
  workflowVersion?: string;

  @IsOptional()
  @IsObject()
  triggerPayload?: Record<string, unknown>;
}

/**
 * Response after triggering a run
 */
export class TriggerRunResponse {
  @IsUUID()
  runId: string;

  @IsEnum(['queued', 'running', 'completed', 'failed', 'cancelled'])
  status: RunStatus;

  @IsOptional()
  @IsString()
  message?: string;
}

/**
 * Run details response
 */
export class RunResponse {
  id: string;
  workflowName: string;
  workflowVersion: string;
  triggerType: TriggerType;
  triggerPayload?: Record<string, unknown>;
  status: RunStatus;
  baseRunId?: string;
  error?: RunError;
  stepsSummary?: StepsSummary;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Response containing list of runs
 */
export class RunListResponse {
  runs: RunResponse[];
  total: number;
}
