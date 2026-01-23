export interface LlmJsonGenerationConfig {
  prompt_id: string;
  prompt_version?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  retry_on_validation_failure?: boolean;
}

export interface LlmReviewConfig {
  rubric_id: string;
  rubric_version?: string;
  evaluation_model?: string;
  include_criteria_details?: boolean;
}

export type TemplateConfig = LlmJsonGenerationConfig | LlmReviewConfig;

export function isLlmJsonGenerationConfig(config: TemplateConfig): config is LlmJsonGenerationConfig {
  return 'prompt_id' in config;
}

export function isLlmReviewConfig(config: TemplateConfig): config is LlmReviewConfig {
  return 'rubric_id' in config;
}
