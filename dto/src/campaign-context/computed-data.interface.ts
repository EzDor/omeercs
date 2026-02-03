export type QualityStatus = 'passed' | 'failed' | 'warning';

export interface QualityCheckResult {
  artifactId: string;
  checkType: string;
  status: QualityStatus;
  message?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface ComputedData {
  inputHashesByStep: Record<string, string>;
  qualityChecks: QualityCheckResult[];
}
