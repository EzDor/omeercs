export type CriterionVerdict = 'pass' | 'fail' | 'indeterminate';

export interface CriterionResult {
  criterionId: string;
  criterionName: string;
  verdict: CriterionVerdict;
  reasoning: string;
  confidence: number;
  evidence?: string[];
}

export interface ReviewTimings {
  rubric_load: number;
  evaluation: number;
  aggregation: number;
  total: number;
}

export interface ReviewResult {
  pass: boolean;
  issues: string[];
  suggested_fixes: string[];
  indeterminate: string[];
  criteria_results?: CriterionResult[];
  scoring?: {
    totalScore: number;
    maxScore: number;
    passThreshold: number;
  };
  timings_ms: ReviewTimings;
}

export interface ReviewInput {
  asset: unknown;
  context?: {
    originalInput?: unknown;
    schema?: Record<string, unknown>;
    referenceOutput?: unknown;
  };
}

export interface ReviewConfig {
  rubricId: string;
  rubricVersion?: string;
  evaluationModel?: string;
  includeCriteriaDetails?: boolean;
}

export interface EvaluationCriterion {
  id: string;
  name: string;
  description: string;
  passCondition: string;
  failCondition: string;
  weight?: number;
}

export interface ReviewRubric {
  rubricId: string;
  version: string;
  description: string;
  scoringMode: 'binary' | 'weighted';
  passThreshold?: number;
  criteria: EvaluationCriterion[];
}

export const ReviewErrorCodes = {
  RUBRIC_NOT_FOUND: 'RUBRIC_NOT_FOUND',
  RUBRIC_VERSION_NOT_FOUND: 'RUBRIC_VERSION_NOT_FOUND',
  EVALUATION_FAILED: 'EVALUATION_FAILED',
  EVALUATION_TIMEOUT: 'EVALUATION_TIMEOUT',
  AGGREGATION_FAILED: 'AGGREGATION_FAILED',
} as const;

export type ReviewErrorCode = (typeof ReviewErrorCodes)[keyof typeof ReviewErrorCodes];
