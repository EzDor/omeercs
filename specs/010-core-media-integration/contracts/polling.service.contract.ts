/**
 * Polling Service Contract
 * Manages async generation job lifecycle: submit → poll → download → store.
 */

export interface PollingConfig {
  pollIntervalMs: number;
  timeoutMs: number;
  providerId: string;
  mediaType: string;
}

export interface SubmitJobParams {
  tenantId: string;
  runId: string;
  runStepId: string;
  providerId: string;
  providerJobId: string;
  mediaType: string;
  inputParams: Record<string, unknown>;
  pollingConfig: PollingConfig;
}

export type GenerationJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'timed_out';

export interface ProviderJobStatus {
  status: GenerationJobStatus;
  resultUri?: string;
  costUsd?: number;
  error?: string;
}

export interface PollingService {
  submitAndTrack(params: SubmitJobParams): Promise<string>;

  pollUntilComplete(jobId: string, checkStatus: (providerJobId: string) => Promise<ProviderJobStatus>): Promise<void>;

  recoverIncompleteJobs(): Promise<void>;
}
