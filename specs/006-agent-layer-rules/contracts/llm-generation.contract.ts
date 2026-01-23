/**
 * LLM JSON Generation Service Contract
 *
 * Defines the interface for the LlmGenerationService that handles
 * schema-validated JSON generation from LLM calls.
 */

// ============================================================================
// Input Types
// ============================================================================

export interface GenerationInput {
  /**
   * Variables to inject into the prompt template
   */
  variables: Record<string, unknown>;

  /**
   * Optional critique from previous failed attempt (for retry)
   */
  critique?: {
    issues: string[];
    suggestions: string[];
  };

  /**
   * Optional execution context overrides
   */
  context?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface GenerationConfig {
  /**
   * Prompt ID in the registry
   */
  promptId: string;

  /**
   * Optional prompt version (defaults to latest)
   */
  promptVersion?: string;

  /**
   * JSON Schema for output validation
   */
  outputSchema: Record<string, unknown>;

  /**
   * Whether to retry on validation failure (default: true)
   */
  retryOnValidationFailure?: boolean;

  /**
   * Maximum validation retry attempts (default: 1)
   */
  maxValidationRetries?: number;

  /**
   * LLM model to use (default: from prompt template)
   */
  model?: string;

  /**
   * Temperature for generation (default: from prompt template)
   */
  temperature?: number;
}

// ============================================================================
// Output Types
// ============================================================================

export interface SchemaValidationError {
  /**
   * JSON path to the invalid field
   */
  field: string;

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * The invalid value (if available)
   */
  value?: unknown;
}

export interface GenerationResult<T = unknown> {
  /**
   * Whether generation produced valid output
   */
  success: boolean;

  /**
   * Parsed, validated output (when success=true)
   */
  data?: T;

  /**
   * Raw LLM response text
   */
  rawResponse?: string;

  /**
   * Validation errors (when success=false)
   */
  validationErrors?: SchemaValidationError[];

  /**
   * Number of generation attempts (1-2)
   */
  attempts: number;

  /**
   * Performance breakdown
   */
  timings_ms: {
    prompt_render: number;
    llm_call: number;
    validation: number;
    retry_llm_call?: number;
    total: number;
  };
}

// ============================================================================
// Service Interface
// ============================================================================

export interface ILlmGenerationService {
  /**
   * Generate structured JSON output from an LLM call
   *
   * @param input - Variables and context for generation
   * @param config - Generation configuration including prompt and schema
   * @returns GenerationResult with validated output or errors
   *
   * @example
   * ```typescript
   * const result = await llmGenerationService.generate(
   *   { variables: { brief: 'Campaign for summer sale' } },
   *   {
   *     promptId: 'campaign_plan',
   *     outputSchema: campaignPlanSchema
   *   }
   * );
   *
   * if (result.success) {
   *   console.log(result.data);
   * } else {
   *   console.error(result.validationErrors);
   * }
   * ```
   */
  generate<T>(
    input: GenerationInput,
    config: GenerationConfig
  ): Promise<GenerationResult<T>>;

  /**
   * Check if a model supports native structured output
   *
   * @param model - Model identifier
   * @returns Whether model has constrained decoding support
   */
  supportsStructuredOutput(model: string): boolean;
}

// ============================================================================
// Error Codes
// ============================================================================

export const GenerationErrorCodes = {
  PROMPT_NOT_FOUND: 'PROMPT_NOT_FOUND',
  PROMPT_RENDER_FAILED: 'PROMPT_RENDER_FAILED',
  LLM_CALL_FAILED: 'LLM_CALL_FAILED',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  JSON_PARSE_FAILED: 'JSON_PARSE_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MAX_RETRIES_EXCEEDED: 'MAX_RETRIES_EXCEEDED',
} as const;

export type GenerationErrorCode =
  (typeof GenerationErrorCodes)[keyof typeof GenerationErrorCodes];
