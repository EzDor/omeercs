/**
 * Step status enum
 */
export type StepStatus = 'pending' | 'running' | 'skipped' | 'completed' | 'failed';

/**
 * Step error details
 */
export interface StepError {
  code: string;
  message: string;
  attempt: number;
  timestamp: Date;
  details?: Record<string, unknown>;
}

/**
 * Run step details
 */
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

/**
 * Response containing run steps
 */
export class RunStepsResponse {
  runId: string;
  steps: RunStep[];
}

/**
 * Artifact details
 */
export class ArtifactDto {
  id: string;
  stepId?: string;
  type: string;
  uri: string;
  contentHash: string;
  sizeBytes?: number;
  filename?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Response containing artifacts for a run
 */
export class ArtifactsResponse {
  runId: string;
  artifacts: ArtifactDto[];
}
