import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { PromptRegistryService } from '../../../prompt-registry/services/prompt-registry.service';
import { SchemaValidatorService } from './schema-validator.service';
import type { GenerationInput, GenerationConfig, GenerationResult, SchemaValidationError, GenerationTimings } from '../interfaces/generation-result.interface';
import { GenerationErrorCodes } from '../interfaces/generation-result.interface';
import type { ChatCompletionRequest, ResponseFormat } from '@agentic-template/common/src/llm/interfaces/chat-completion-request.interface';

const STRUCTURED_OUTPUT_MODELS = ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-sonnet', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gemini-1.5-pro', 'gemini-1.5-flash'];

const DEFAULT_MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;

@Injectable()
export class LlmGenerationService {
  private readonly logger = new Logger(LlmGenerationService.name);
  private readonly litellmClient: LiteLLMHttpClient;
  private readonly defaultModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly promptRegistryService: PromptRegistryService,
    private readonly schemaValidatorService: SchemaValidatorService,
  ) {
    this.litellmClient = LiteLLMClientFactory.createClientFromConfig(configService);
    this.defaultModel = configService.get<string>('LITELLM_MODEL') || 'claude-3-5-sonnet';
  }

  async generate<T>(input: GenerationInput, config: GenerationConfig): Promise<GenerationResult<T>> {
    const timings: GenerationTimings = {
      prompt_render: 0,
      llm_call: 0,
      validation: 0,
      total: 0,
    };
    const startTime = Date.now();

    try {
      // 1. Get and render prompt template
      const promptRenderStart = Date.now();
      const promptVersion = config.promptVersion || undefined;
      const promptResult = this.promptRegistryService.getPrompt(config.promptId, promptVersion);

      if (!promptResult.ok) {
        timings.prompt_render = Date.now() - promptRenderStart;
        timings.total = Date.now() - startTime;
        return this.createErrorResult<T>(GenerationErrorCodes.PROMPT_NOT_FOUND, `Prompt not found: ${config.promptId}`, timings, 0);
      }

      const resolvedVersion = promptResult.data.version;
      const renderResult = this.promptRegistryService.renderPrompt(config.promptId, resolvedVersion, this.buildPromptVariables(input));

      if (!renderResult.ok) {
        timings.prompt_render = Date.now() - promptRenderStart;
        timings.total = Date.now() - startTime;
        return this.createErrorResult<T>(GenerationErrorCodes.PROMPT_RENDER_FAILED, `Failed to render prompt: ${renderResult.error}`, timings, 0);
      }

      timings.prompt_render = Date.now() - promptRenderStart;

      // 2. Build LLM request
      const model = input.context?.model || config.model || promptResult.data.modelDefaults?.model || this.defaultModel;
      const temperature = input.context?.temperature ?? config.temperature ?? promptResult.data.modelDefaults?.temperature ?? 0.7;
      const maxTokens = input.context?.maxTokens ?? promptResult.data.modelDefaults?.max_tokens ?? 4096;

      // 3. Call LLM with exponential backoff (FR-011)
      const llmCallStart = Date.now();
      let llmResponse: string;

      try {
        llmResponse = await this.callLlmWithBackoff(renderResult.data.content, model, temperature, maxTokens, config.outputSchema);
      } catch (error) {
        timings.llm_call = Date.now() - llmCallStart;
        timings.total = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown LLM error';
        return this.createErrorResult<T>(GenerationErrorCodes.LLM_CALL_FAILED, errorMessage, timings, 1);
      }

      timings.llm_call = Date.now() - llmCallStart;

      // 4. Parse JSON response
      let parsedData: T;
      try {
        parsedData = JSON.parse(llmResponse) as T;
      } catch {
        timings.total = Date.now() - startTime;
        return this.createErrorResult<T>(GenerationErrorCodes.JSON_PARSE_FAILED, 'Failed to parse LLM response as JSON', timings, 1, llmResponse);
      }

      // 5. Validate against schema (FR-015)
      const validationStart = Date.now();
      const validationResult = this.schemaValidatorService.validateOutput(config.outputSchema, parsedData, config.promptId, 'generation');

      if (!validationResult.valid) {
        timings.validation = Date.now() - validationStart;

        // 6. Auto-retry on validation failure (FR-010)
        const retryEnabled = config.retryOnValidationFailure !== false;
        const maxRetries = config.maxValidationRetries ?? 1;

        if (retryEnabled && maxRetries > 0) {
          const retryResult = await this.retryWithValidationErrors<T>(input, config, validationResult.errors, model, temperature, maxTokens, timings);

          if (retryResult) {
            return retryResult;
          }
        }

        timings.total = Date.now() - startTime;
        return {
          success: false,
          rawResponse: llmResponse,
          validationErrors: validationResult.errors,
          attempts: 1,
          timings_ms: timings,
        };
      }

      timings.validation = Date.now() - validationStart;
      timings.total = Date.now() - startTime;

      return {
        success: true,
        data: parsedData,
        rawResponse: llmResponse,
        attempts: 1,
        timings_ms: timings,
      };
    } catch (error) {
      timings.total = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Generation failed: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      return this.createErrorResult<T>(GenerationErrorCodes.LLM_CALL_FAILED, errorMessage, timings, 1);
    }
  }

  supportsStructuredOutput(model: string): boolean {
    const normalizedModel = model.toLowerCase();
    return STRUCTURED_OUTPUT_MODELS.some((m) => normalizedModel.includes(m.toLowerCase()));
  }

  private buildPromptVariables(input: GenerationInput): Record<string, unknown> {
    const vars: Record<string, unknown> = { ...input.variables };

    if (input.critique) {
      vars.critique = input.critique;
      vars.previous_issues = input.critique.issues.join('\n- ');
      vars.suggestions = input.critique.suggestions.join('\n- ');
    }

    return vars;
  }

  private async callLlmWithBackoff(prompt: string, model: string, temperature: number, maxTokens: number, outputSchema: Record<string, unknown>): Promise<string> {
    let lastError: Error | undefined;
    let backoffMs = INITIAL_BACKOFF_MS;

    for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
      try {
        const request = this.buildChatCompletionRequest(prompt, model, temperature, maxTokens, outputSchema);
        const response = await this.litellmClient.chatCompletion(request);

        if (!response.choices?.[0]?.message?.content) {
          throw new Error('Empty response from LLM');
        }

        return response.choices[0].message.content;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`LLM call attempt ${attempt}/${DEFAULT_MAX_RETRIES} failed: ${lastError.message}`);

        if (attempt < DEFAULT_MAX_RETRIES) {
          await this.sleep(backoffMs);
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        }
      }
    }

    throw lastError || new Error('LLM call failed after max retries');
  }

  private buildChatCompletionRequest(prompt: string, model: string, temperature: number, maxTokens: number, outputSchema: Record<string, unknown>): ChatCompletionRequest {
    const request: ChatCompletionRequest = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    };

    // Use structured output if model supports it
    if (this.supportsStructuredOutput(model)) {
      const responseFormat: ResponseFormat = {
        type: 'json_schema',
        json_schema: {
          name: 'generation_output',
          schema: outputSchema,
          strict: true,
        },
      };
      request.response_format = responseFormat;
    } else {
      // Fallback to json_object mode
      request.response_format = { type: 'json_object' };
    }

    return request;
  }

  private async retryWithValidationErrors<T>(
    originalInput: GenerationInput,
    config: GenerationConfig,
    validationErrors: SchemaValidationError[],
    model: string,
    temperature: number,
    maxTokens: number,
    timings: GenerationTimings,
  ): Promise<GenerationResult<T> | null> {
    const retryStartTime = Date.now();

    // Build retry input with validation errors injected
    const retryInput: GenerationInput = {
      ...originalInput,
      critique: {
        issues: validationErrors.map((e) => `Field "${e.field}": ${e.message}`),
        suggestions: ['Please fix the validation errors and ensure the output matches the expected schema.'],
      },
    };

    // Re-render prompt with critique
    const promptVersion = config.promptVersion || undefined;
    const renderResult = this.promptRegistryService.renderPrompt(config.promptId, promptVersion || this.getLatestVersion(config.promptId), this.buildPromptVariables(retryInput));

    if (!renderResult.ok) {
      return null;
    }

    // Retry LLM call
    let retryResponse: string;
    try {
      retryResponse = await this.callLlmWithBackoff(renderResult.data.content, model, temperature, maxTokens, config.outputSchema);
    } catch {
      return null;
    }

    timings.retry_llm_call = Date.now() - retryStartTime;

    // Parse retry response
    let retryData: T;
    try {
      retryData = JSON.parse(retryResponse) as T;
    } catch {
      return null;
    }

    // Validate retry response
    const retryValidation = this.schemaValidatorService.validateOutput(config.outputSchema, retryData, config.promptId, 'generation_retry');

    if (!retryValidation.valid) {
      timings.total = Date.now() - (timings.prompt_render + timings.llm_call + retryStartTime - Date.now());
      return {
        success: false,
        rawResponse: retryResponse,
        validationErrors: retryValidation.errors,
        attempts: 2,
        timings_ms: timings,
      };
    }

    return {
      success: true,
      data: retryData,
      rawResponse: retryResponse,
      attempts: 2,
      timings_ms: timings,
    };
  }

  private getLatestVersion(promptId: string): string {
    const versions = this.promptRegistryService.listPromptVersions(promptId);
    return versions[0] || '1.0.0';
  }

  private createErrorResult<T>(errorCode: string, errorMessage: string, timings: GenerationTimings, attempts: number, rawResponse?: string): GenerationResult<T> {
    this.logger.error(`Generation error [${errorCode}]: ${errorMessage}`);
    return {
      success: false,
      rawResponse,
      validationErrors: [{ field: '', message: `[${errorCode}] ${errorMessage}` }],
      attempts,
      timings_ms: timings,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
