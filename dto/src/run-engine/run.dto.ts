import { IsString, IsObject, IsOptional, IsUUID, IsEnum, IsIn } from 'class-validator';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TriggerType = 'initial' | 'update';

export const VALID_WORKFLOW_NAMES = [
  'campaign.build',
  'campaign.build.minimal',
  'campaign.update_intro',
  'campaign.update_audio',
  'campaign.update_outcome',
  'campaign.update_game_config',
  'campaign.replace_3d_asset',
] as const;

export type ValidWorkflowName = (typeof VALID_WORKFLOW_NAMES)[number];

export interface RunError {
  code: string;
  message: string;
  failedStepId?: string;
  timestamp: Date;
}

export class TriggerRunRequest {
  @IsString()
  @IsIn([...VALID_WORKFLOW_NAMES])
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
