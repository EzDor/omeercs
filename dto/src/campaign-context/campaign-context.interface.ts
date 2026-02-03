import type { TriggerInfo } from './trigger-info.interface';
import type { ArtifactData } from './artifact-data.interface';
import type { ArtifactReferences } from './artifact-references.interface';
import type { ComputedData } from './computed-data.interface';

export type ArtifactMap = Record<string, ArtifactData>;

export interface CampaignContext {
  campaignId: string;
  runId: string;
  workflowName: string;
  trigger: TriggerInfo;
  refs: ArtifactReferences;
  artifacts: ArtifactMap;
  computed?: ComputedData;
}

export interface CreateContextParams {
  campaignId: string;
  runId: string;
  workflowName: string;
  trigger: TriggerInfo;
}

export interface StepArtifact {
  type: string;
  uri: string;
  hash: string;
  metadata?: Record<string, unknown>;
}

export interface AttachStepResultParams {
  stepId: string;
  artifacts: StepArtifact[];
}

export interface StoreInputHashParams {
  stepId: string;
  inputHash: string;
}

export interface StoreQualityCheckParams {
  artifactId: string;
  checkType: string;
  status: 'passed' | 'failed' | 'warning';
  message?: string;
  details?: Record<string, unknown>;
}
