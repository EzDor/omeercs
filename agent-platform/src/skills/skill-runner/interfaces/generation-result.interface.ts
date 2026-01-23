export interface SchemaValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface GenerationTimings {
  prompt_render: number;
  llm_call: number;
  validation: number;
  retry_llm_call?: number;
  total: number;
}

export interface GenerationResult<T = unknown> {
  success: boolean;
  data?: T;
  rawResponse?: string;
  validationErrors?: SchemaValidationError[];
  attempts: number;
  timings_ms: GenerationTimings;
}

export interface GenerationInput {
  variables: Record<string, unknown>;
  critique?: {
    issues: string[];
    suggestions: string[];
  };
  context?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface GenerationConfig {
  promptId: string;
  promptVersion?: string;
  outputSchema: Record<string, unknown>;
  retryOnValidationFailure?: boolean;
  maxValidationRetries?: number;
  model?: string;
  temperature?: number;
}

export const GenerationErrorCodes = {
  PROMPT_NOT_FOUND: 'PROMPT_NOT_FOUND',
  PROMPT_RENDER_FAILED: 'PROMPT_RENDER_FAILED',
  LLM_CALL_FAILED: 'LLM_CALL_FAILED',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  JSON_PARSE_FAILED: 'JSON_PARSE_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MAX_RETRIES_EXCEEDED: 'MAX_RETRIES_EXCEEDED',
} as const;

export type GenerationErrorCode = (typeof GenerationErrorCodes)[keyof typeof GenerationErrorCodes];
