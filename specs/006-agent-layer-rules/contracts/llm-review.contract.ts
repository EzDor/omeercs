/**
 * LLM Review Service Contract
 *
 * Defines the interface for the LlmReviewService that handles
 * rubric-based evaluation of assets using LLM-as-a-judge.
 */

// ============================================================================
// Input Types
// ============================================================================

export interface ReviewInput {
  /**
   * The asset/output to evaluate
   */
  asset: unknown;

  /**
   * Optional context for evaluation
   */
  context?: {
    /**
     * Original input that produced the asset
     */
    originalInput?: unknown;

    /**
     * Expected schema for the asset
     */
    schema?: Record<string, unknown>;

    /**
     * Reference/expected output for comparison
     */
    referenceOutput?: unknown;
  };
}

export interface ReviewConfig {
  /**
   * Rubric ID in the registry
   */
  rubricId: string;

  /**
   * Optional rubric version (defaults to latest)
   */
  rubricVersion?: string;

  /**
   * Model to use for evaluation (default: claude-sonnet)
   * Recommendation: Use a different model than production for unbiased evaluation
   */
  evaluationModel?: string;

  /**
   * Whether to include detailed per-criterion results
   */
  includeCriteriaDetails?: boolean;
}

// ============================================================================
// Rubric Types
// ============================================================================

export interface EvaluationCriterion {
  /**
   * Unique identifier for the criterion
   */
  id: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Description of what this criterion evaluates
   */
  description: string;

  /**
   * Condition for passing this criterion
   */
  passCondition: string;

  /**
   * Condition for failing this criterion
   */
  failCondition: string;

  /**
   * Weight for scoring (default: 1)
   */
  weight?: number;
}

export interface ReviewRubric {
  /**
   * Unique identifier for the rubric
   */
  rubricId: string;

  /**
   * Semantic version
   */
  version: string;

  /**
   * Description of the rubric's purpose
   */
  description: string;

  /**
   * How to aggregate criterion results
   */
  scoringMode: 'binary' | 'weighted';

  /**
   * Score threshold for pass (weighted mode only)
   */
  passThreshold?: number;

  /**
   * List of evaluation criteria
   */
  criteria: EvaluationCriterion[];
}

// ============================================================================
// Output Types
// ============================================================================

export type CriterionVerdict = 'pass' | 'fail' | 'indeterminate';

export interface CriterionResult {
  /**
   * ID of the evaluated criterion
   */
  criterionId: string;

  /**
   * Name of the criterion
   */
  criterionName: string;

  /**
   * Evaluation verdict
   */
  verdict: CriterionVerdict;

  /**
   * Step-by-step reasoning for the verdict
   */
  reasoning: string;

  /**
   * Confidence score (0-100)
   */
  confidence: number;

  /**
   * Specific evidence from the asset supporting the verdict
   */
  evidence?: string[];
}

export interface ReviewResult {
  /**
   * Overall review verdict
   */
  pass: boolean;

  /**
   * Descriptions of failed criteria
   */
  issues: string[];

  /**
   * Actionable fix recommendations
   */
  suggested_fixes: string[];

  /**
   * Criteria that couldn't be confidently evaluated
   */
  indeterminate: string[];

  /**
   * Detailed per-criterion breakdown (if requested)
   */
  criteria_results?: CriterionResult[];

  /**
   * Score information (weighted mode only)
   */
  scoring?: {
    totalScore: number;
    maxScore: number;
    passThreshold: number;
  };

  /**
   * Performance breakdown
   */
  timings_ms: {
    rubric_load: number;
    evaluation: number;
    aggregation: number;
    total: number;
  };
}

// ============================================================================
// Service Interface
// ============================================================================

export interface ILlmReviewService {
  /**
   * Review an asset against a rubric
   *
   * @param input - Asset and context to evaluate
   * @param config - Review configuration including rubric reference
   * @returns ReviewResult with verdict, issues, and suggestions
   *
   * @example
   * ```typescript
   * const result = await llmReviewService.review(
   *   {
   *     asset: generatedCampaignPlan,
   *     context: { schema: campaignPlanSchema }
   *   },
   *   {
   *     rubricId: 'campaign_quality',
   *     includeCriteriaDetails: true
   *   }
   * );
   *
   * if (result.pass) {
   *   console.log('Asset passed review');
   * } else {
   *   console.log('Issues:', result.issues);
   *   console.log('Fixes:', result.suggested_fixes);
   * }
   * ```
   */
  review(input: ReviewInput, config: ReviewConfig): Promise<ReviewResult>;

  /**
   * Get a rubric by ID and version
   *
   * @param rubricId - Rubric identifier
   * @param version - Optional version (defaults to latest)
   * @returns The rubric or null if not found
   */
  getRubric(rubricId: string, version?: string): Promise<ReviewRubric | null>;

  /**
   * List all available rubrics
   *
   * @returns Array of rubric IDs
   */
  listRubrics(): Promise<string[]>;
}

// ============================================================================
// Error Codes
// ============================================================================

export const ReviewErrorCodes = {
  RUBRIC_NOT_FOUND: 'RUBRIC_NOT_FOUND',
  RUBRIC_VERSION_NOT_FOUND: 'RUBRIC_VERSION_NOT_FOUND',
  EVALUATION_FAILED: 'EVALUATION_FAILED',
  EVALUATION_TIMEOUT: 'EVALUATION_TIMEOUT',
  AGGREGATION_FAILED: 'AGGREGATION_FAILED',
} as const;

export type ReviewErrorCode =
  (typeof ReviewErrorCodes)[keyof typeof ReviewErrorCodes];

// ============================================================================
// Standard Rubric Templates
// ============================================================================

/**
 * Standard rubric for schema compliance checking
 */
export const SCHEMA_COMPLIANCE_RUBRIC_TEMPLATE: Omit<ReviewRubric, 'rubricId' | 'version'> = {
  description: 'Validates that output conforms to expected JSON schema',
  scoringMode: 'binary',
  criteria: [
    {
      id: 'valid_json',
      name: 'Valid JSON',
      description: 'Output must be parseable JSON',
      passCondition: 'Output is valid, parseable JSON',
      failCondition: 'Output contains JSON syntax errors',
      weight: 1,
    },
    {
      id: 'required_fields',
      name: 'Required Fields Present',
      description: 'All schema-required fields must be present',
      passCondition: 'All required fields from schema are present',
      failCondition: 'One or more required fields are missing',
      weight: 2,
    },
    {
      id: 'correct_types',
      name: 'Correct Field Types',
      description: 'Field values must match schema types',
      passCondition: 'All fields match their declared types in schema',
      failCondition: 'One or more fields have incorrect types',
      weight: 2,
    },
  ],
};

/**
 * Standard rubric for content quality checking
 */
export const CONTENT_QUALITY_RUBRIC_TEMPLATE: Omit<ReviewRubric, 'rubricId' | 'version'> = {
  description: 'Evaluates content quality, relevance, and completeness',
  scoringMode: 'weighted',
  passThreshold: 5,
  criteria: [
    {
      id: 'relevance',
      name: 'Content Relevance',
      description: 'Output addresses the input request',
      passCondition: 'Content directly addresses user request',
      failCondition: 'Content is off-topic or unrelated',
      weight: 3,
    },
    {
      id: 'completeness',
      name: 'Response Completeness',
      description: 'All required information is provided',
      passCondition: 'Response includes all requested elements',
      failCondition: 'Response is incomplete or missing key information',
      weight: 2,
    },
    {
      id: 'clarity',
      name: 'Clarity',
      description: 'Output is clear and understandable',
      passCondition: 'Language is clear, concise, well-structured',
      failCondition: 'Output is confusing, ambiguous, or poorly structured',
      weight: 2,
    },
  ],
};
