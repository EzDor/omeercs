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

export class RunStepsResponse {
  runId: string;
  steps: RunStep[];
}

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

export class ArtifactsResponse {
  runId: string;
  artifacts: ArtifactDto[];
}

export interface CacheAnalysisStep {
  stepId: string;
  skillId: string;
  status: StepStatus;
  cacheHit: boolean;
  inputHash: string;
  executedFrom: 'cache' | 'fresh';
}

export class CacheAnalysisResponse {
  runId: string;
  totalSteps: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  steps: CacheAnalysisStep[];
}
