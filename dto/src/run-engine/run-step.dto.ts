export type StepStatus = 'pending' | 'running' | 'skipped' | 'completed' | 'failed';

export interface StepError {
  code: string;
  message: string;
  attempt: number;
  timestamp: Date;
  details?: Record<string, unknown>;
}

export class RunStep {
  id: string;
  stepId: string;
  skillId: string;
  status: StepStatus;
  inputHash: string;
  attempt: number;
  outputArtifactIds?: string[];
  error?: StepError;
  cacheHit: boolean;
  startedAt?: Date;
  endedAt?: Date;
  durationMs?: number;
}
