import { IsString, IsObject, IsOptional, IsUUID, IsEnum } from 'class-validator';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TriggerType = 'initial' | 'update';

export interface StepsSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  skipped: number;
  failed: number;
}

export interface RunError {
  code: string;
  message: string;
  failedStepId?: string;
  timestamp: Date;
}

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

export class TriggerRunResponse {
  @IsUUID()
  runId: string;

  @IsEnum(['queued', 'running', 'completed', 'failed', 'cancelled'])
  status: RunStatus;

  @IsOptional()
  @IsString()
  message?: string;
}

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
  durationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

export class RunListResponse {
  runs: RunResponse[];
  total: number;
}
