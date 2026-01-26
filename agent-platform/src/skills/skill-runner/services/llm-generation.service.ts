import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LiteLLMHttpClient } from '@agentic-template/common/src/llm/litellm-http.client';
import { LiteLLMClientFactory } from '@agentic-template/common/src/llm/litellm-client.factory';
import { PromptRegistryService } from '../../../prompt-registry/services/prompt-registry.service';
import { SchemaValidatorService } from './schema-validator.service';
import type { GenerationInput, GenerationConfig, GenerationResult, SchemaValidationError, GenerationTimings } from '../interfaces/generation-result.interface';
import { GenerationErrorCodes } from '../interfaces/generation-result.interface';
import type { ChatCompletionRequest, ResponseFormat } from '@agentic-template/common/src/llm/interfaces/chat-completion-request.interface';
import type { RegistryResult } from '@agentic-template/dto/src/prompt-registry/registry-result.interface';
import type { RenderedPrompt } from '@agentic-template/dto/src/prompt-registry/prompt-template.interface';

const STRUCTURED_OUTPUT_MODELS = ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-sonnet', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gemini-1.5-pro', 'gemini-1.5-flash'];

const DEFAULT_MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;

interface ModelParameters {
  model: string;
  temperature: number;
  maxTokens: number;
}

interface PromptRenderResult {
  success: true;
  content: string;
  promptData: { version: string; modelDefaults?: { model?: string; temperature?: number; max_tokens?: number } };
}

interface PromptRenderError<T> {
  success: false;
  errorResult: GenerationResult<T>;
}

interface ParseResult<T> {
  success: boolean;
  data?: T;
}

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
    const timings = this.initializeTimings();
    const startTime = Date.now();

    try {
      const promptResult = this.fetchAndRenderPrompt<T>(config, input, timings, startTime);
      if (!promptResult.success) {
        return promptResult.errorResult;
      }

      const params = this.resolveModelParameters(input, config, promptResult.promptData);

      const llmResult = await this.callLlmAndParseResponse<T>(promptResult.content, params, config.outputSchema, timings, startTime);
      if (!llmResult.success) {
        return llmResult.errorResult;
      }

      return this.validateAndBuildResult<T>(llmResult.data, llmResult.rawResponse, input, config, params, timings, startTime);
    } catch (error) {
      return this.handleUnexpectedError<T>(error, timings, startTime);
    }
  }

  supportsStructuredOutput(model: string): boolean {
    return this.isModelInStructuredOutputList(model);
  }

  private initializeTimings(): GenerationTimings {
    return {
      prompt_render: 0,
      llm_call: 0,
      validation: 0,
      total: 0,
    };
  }

  private fetchAndRenderPrompt<T>(config: GenerationConfig, input: GenerationInput, timings: GenerationTimings, startTime: number): PromptRenderResult | PromptRenderError<T> {
    const promptRenderStart = Date.now();
    const promptVersion = config.promptVersion || undefined;
    const promptResult = this.promptRegistryService.getPrompt(config.promptId, promptVersion);

    if (!promptResult.ok) {
      return this.buildPromptNotFoundError<T>(config.promptId, timings, promptRenderStart, startTime);
    }

    const resolvedVersion = promptResult.data.version;
    const renderResult = this.promptRegistryService.renderPrompt(config.promptId, resolvedVersion, this.buildPromptVariables(input));

    if (!renderResult.ok) {
      return this.buildPromptRenderError<T>(renderResult.error, timings, promptRenderStart, startTime);
    }

    timings.prompt_render = Date.now() - promptRenderStart;

    return {
      success: true,
      content: renderResult.data.content,
      promptData: promptResult.data,
    };
  }

  private buildPromptNotFoundError<T>(promptId: string, timings: GenerationTimings, promptRenderStart: number, startTime: number): PromptRenderError<T> {
    timings.prompt_render = Date.now() - promptRenderStart;
    timings.total = Date.now() - startTime;
    return {
      success: false,
      errorResult: this.createErrorResult<T>(GenerationErrorCodes.PROMPT_NOT_FOUND, `Prompt not found: ${promptId}`, timings, 0),
    };
  }

  private buildPromptRenderError<T>(error: string | undefined, timings: GenerationTimings, promptRenderStart: number, startTime: number): PromptRenderError<T> {
    timings.prompt_render = Date.now() - promptRenderStart;
    timings.total = Date.now() - startTime;
    return {
      success: false,
      errorResult: this.createErrorResult<T>(GenerationErrorCodes.PROMPT_RENDER_FAILED, `Failed to render prompt: ${error}`, timings, 0),
    };
  }

  private resolveModelParameters(
    input: GenerationInput,
    config: GenerationConfig,
    promptData: { modelDefaults?: { model?: string; temperature?: number; max_tokens?: number } },
  ): ModelParameters {
    return {
      model: this.resolveModel(input, config, promptData.modelDefaults),
      temperature: this.resolveTemperature(input, config, promptData.modelDefaults),
      maxTokens: this.resolveMaxTokens(input, config, promptData.modelDefaults),
    };
  }

  private resolveModel(input: GenerationInput, config: GenerationConfig, defaults?: { model?: string }): string {
    return input.context?.model || config.model || defaults?.model || this.defaultModel;
  }

  private resolveTemperature(input: GenerationInput, config: GenerationConfig, defaults?: { temperature?: number }): number {
    return input.context?.temperature ?? config.temperature ?? defaults?.temperature ?? 0.7;
  }

  private resolveMaxTokens(input: GenerationInput, config: GenerationConfig, defaults?: { max_tokens?: number }): number {
    return input.context?.maxTokens ?? config.maxTokens ?? defaults?.max_tokens ?? 4096;
  }

  private async callLlmAndParseResponse<T>(
    prompt: string,
    params: ModelParameters,
    outputSchema: Record<string, unknown>,
    timings: GenerationTimings,
    startTime: number,
  ): Promise<{ success: true; data: T; rawResponse: string } | { success: false; errorResult: GenerationResult<T> }> {
    const llmCallStart = Date.now();

    const llmResult = await this.executeLlmCall(prompt, params, outputSchema);
    if (!llmResult.success) {
      return this.buildLlmCallError<T>(llmResult.error, timings, llmCallStart, startTime);
    }

    timings.llm_call = Date.now() - llmCallStart;

    const parseResult = this.parseJsonResponse<T>(llmResult.response);
    if (!parseResult.success) {
      return this.buildJsonParseError<T>(llmResult.response, timings, startTime);
    }

    return { success: true, data: parseResult.data!, rawResponse: llmResult.response };
  }

  private async executeLlmCall(
    prompt: string,
    params: ModelParameters,
    outputSchema: Record<string, unknown>,
  ): Promise<{ success: true; response: string } | { success: false; error: string }> {
    try {
      const response = await this.callLlmWithBackoff(prompt, params.model, params.temperature, params.maxTokens, outputSchema);
      return { success: true, response };
    } catch (error) {
      return { success: false, error: this.extractErrorMessage(error) };
    }
  }

  private buildLlmCallError<T>(errorMessage: string, timings: GenerationTimings, llmCallStart: number, startTime: number): { success: false; errorResult: GenerationResult<T> } {
    timings.llm_call = Date.now() - llmCallStart;
    timings.total = Date.now() - startTime;
    return {
      success: false,
      errorResult: this.createErrorResult<T>(GenerationErrorCodes.LLM_CALL_FAILED, errorMessage, timings, 1),
    };
  }

  private parseJsonResponse<T>(response: string): ParseResult<T> {
    try {
      const data = JSON.parse(response) as T;
      return { success: true, data };
    } catch {
      return { success: false };
    }
  }

  private buildJsonParseError<T>(rawResponse: string, timings: GenerationTimings, startTime: number): { success: false; errorResult: GenerationResult<T> } {
    timings.total = Date.now() - startTime;
    return {
      success: false,
      errorResult: this.createErrorResult<T>(GenerationErrorCodes.JSON_PARSE_FAILED, 'Failed to parse LLM response as JSON', timings, 1, rawResponse),
    };
  }

  private async validateAndBuildResult<T>(
    parsedData: T,
    rawResponse: string,
    input: GenerationInput,
    config: GenerationConfig,
    params: ModelParameters,
    timings: GenerationTimings,
    startTime: number,
  ): Promise<GenerationResult<T>> {
    const validationStart = Date.now();
    const validationResult = this.schemaValidatorService.validateOutput(config.outputSchema, parsedData, config.promptId, 'generation');

    if (!validationResult.valid) {
      timings.validation = Date.now() - validationStart;
      return this.handleValidationFailure<T>(rawResponse, validationResult.errors, input, config, params, timings, startTime);
    }

    timings.validation = Date.now() - validationStart;
    timings.total = Date.now() - startTime;

    return this.buildSuccessResult(parsedData, rawResponse, 1, timings);
  }

  private async handleValidationFailure<T>(
    rawResponse: string,
    validationErrors: SchemaValidationError[],
    input: GenerationInput,
    config: GenerationConfig,
    params: ModelParameters,
    timings: GenerationTimings,
    startTime: number,
  ): Promise<GenerationResult<T>> {
    if (this.shouldRetryOnValidationFailure(config)) {
      const retryResult = await this.executeRetryAttempt<T>(input, config, validationErrors, params, timings, startTime);
      if (retryResult) {
        return retryResult;
      }
    }

    timings.total = Date.now() - startTime;
    return this.buildValidationFailureResult(rawResponse, validationErrors, 1, timings);
  }

  private shouldRetryOnValidationFailure(config: GenerationConfig): boolean {
    const retryEnabled = config.retryOnValidationFailure !== false;
    const maxRetries = config.maxValidationRetries ?? 1;
    return retryEnabled && maxRetries > 0;
  }

  private buildValidationFailureResult<T>(rawResponse: string, errors: SchemaValidationError[], attempts: number, timings: GenerationTimings): GenerationResult<T> {
    return {
      success: false,
      rawResponse,
      validationErrors: errors,
      attempts,
      timings_ms: timings,
    };
  }

  private buildSuccessResult<T>(data: T, rawResponse: string, attempts: number, timings: GenerationTimings): GenerationResult<T> {
    return {
      success: true,
      data,
      rawResponse,
      attempts,
      timings_ms: timings,
    };
  }

  private handleUnexpectedError<T>(error: unknown, timings: GenerationTimings, startTime: number): GenerationResult<T> {
    timings.total = Date.now() - startTime;
    const errorMessage = this.extractErrorMessage(error);
    this.logger.error(`Generation failed: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
    return this.createErrorResult<T>(GenerationErrorCodes.LLM_CALL_FAILED, errorMessage, timings, 1);
  }

  private isModelInStructuredOutputList(model: string): boolean {
    const normalizedModel = model.toLowerCase();
    return STRUCTURED_OUTPUT_MODELS.some((supportedModel) => normalizedModel.includes(supportedModel.toLowerCase()));
  }

  private buildPromptVariables(input: GenerationInput): Record<string, unknown> {
    const vars: Record<string, unknown> = { ...input.variables };

    if (this.hasCritique(input)) {
      this.addCritiqueVariables(vars, input.critique!);
    }

    return vars;
  }

  private hasCritique(input: GenerationInput): boolean {
    return input.critique !== undefined;
  }

  private addCritiqueVariables(vars: Record<string, unknown>, critique: { issues: string[]; suggestions: string[] }): void {
    vars.previous_issues = critique.issues.map((issue) => `- ${issue}`).join('\n');
    vars.suggestions = critique.suggestions.map((s) => `- ${s}`).join('\n');
  }

  private async callLlmWithBackoff(prompt: string, model: string, temperature: number, maxTokens: number, outputSchema: Record<string, unknown>): Promise<string> {
    let lastError: Error | undefined;
    let backoffMs = INITIAL_BACKOFF_MS;

    for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
      const result = await this.attemptLlmCall(prompt, model, temperature, maxTokens, outputSchema);

      if (result.success) {
        return result.response;
      }

      lastError = result.error;
      this.logFailedAttempt(attempt, lastError.message);

      if (this.hasMoreRetries(attempt)) {
        await this.sleep(backoffMs);
        backoffMs = this.calculateNextBackoff(backoffMs);
      }
    }

    throw lastError || new Error('LLM call failed after max retries');
  }

  private async attemptLlmCall(
    prompt: string,
    model: string,
    temperature: number,
    maxTokens: number,
    outputSchema: Record<string, unknown>,
  ): Promise<{ success: true; response: string } | { success: false; error: Error }> {
    try {
      const request = this.buildChatCompletionRequest(prompt, model, temperature, maxTokens, outputSchema);
      const response = await this.litellmClient.chatCompletion(request);

      if (this.isEmptyResponse(response)) {
        return { success: false, error: new Error('Empty response from LLM') };
      }

      return { success: true, response: response.choices[0].message.content };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  private isEmptyResponse(response: { choices?: { message?: { content?: string } }[] }): boolean {
    return !response.choices?.[0]?.message?.content;
  }

  private logFailedAttempt(attempt: number, message: string): void {
    this.logger.warn(`LLM call attempt ${attempt}/${DEFAULT_MAX_RETRIES} failed: ${message}`);
  }

  private hasMoreRetries(attempt: number): boolean {
    return attempt < DEFAULT_MAX_RETRIES;
  }

  private calculateNextBackoff(currentBackoff: number): number {
    return Math.min(currentBackoff * 2, MAX_BACKOFF_MS);
  }

  private buildChatCompletionRequest(prompt: string, model: string, temperature: number, maxTokens: number, outputSchema: Record<string, unknown>): ChatCompletionRequest {
    const request: ChatCompletionRequest = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    };

    request.response_format = this.buildResponseFormat(model, outputSchema);

    return request;
  }

  private buildResponseFormat(model: string, outputSchema: Record<string, unknown>): ResponseFormat {
    if (this.supportsStructuredOutput(model)) {
      return this.buildStructuredOutputFormat(outputSchema);
    }
    return this.buildFallbackJsonFormat();
  }

  private buildStructuredOutputFormat(outputSchema: Record<string, unknown>): ResponseFormat {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'generation_output',
        schema: outputSchema,
        strict: true,
      },
    };
  }

  private buildFallbackJsonFormat(): ResponseFormat {
    return { type: 'json_object' };
  }

  private async executeRetryAttempt<T>(
    originalInput: GenerationInput,
    config: GenerationConfig,
    validationErrors: SchemaValidationError[],
    params: ModelParameters,
    timings: GenerationTimings,
    startTime: number,
  ): Promise<GenerationResult<T> | null> {
    const retryStartTime = Date.now();

    const retryInput = this.buildRetryInput(originalInput, validationErrors);

    const renderResult = this.renderRetryPrompt(config, retryInput);
    if (!renderResult.ok) {
      return null;
    }

    const retryResponse = await this.executeRetryLlmCall(renderResult.data.content, params, config.outputSchema);
    if (!retryResponse.success) {
      return null;
    }

    timings.retry_llm_call = Date.now() - retryStartTime;

    const parseResult = this.parseJsonResponse<T>(retryResponse.response);
    if (!parseResult.success) {
      return null;
    }

    return this.validateRetryResponse<T>(parseResult.data!, retryResponse.response, config, timings, startTime);
  }

  private buildRetryInput(originalInput: GenerationInput, validationErrors: SchemaValidationError[]): GenerationInput {
    return {
      ...originalInput,
      critique: this.formatValidationErrorsAsCritique(validationErrors),
    };
  }

  private formatValidationErrorsAsCritique(errors: SchemaValidationError[]): { issues: string[]; suggestions: string[] } {
    return {
      issues: errors.map((e) => `Field "${e.field}": ${e.message}`),
      suggestions: ['Please fix the validation errors and ensure the output matches the expected schema.'],
    };
  }

  private renderRetryPrompt(config: GenerationConfig, retryInput: GenerationInput): RegistryResult<RenderedPrompt> {
    const promptVersion = config.promptVersion || this.getLatestVersion(config.promptId);
    return this.promptRegistryService.renderPrompt(config.promptId, promptVersion, this.buildPromptVariables(retryInput));
  }

  private async executeRetryLlmCall(
    content: string,
    params: ModelParameters,
    outputSchema: Record<string, unknown>,
  ): Promise<{ success: true; response: string } | { success: false }> {
    try {
      const response = await this.callLlmWithBackoff(content, params.model, params.temperature, params.maxTokens, outputSchema);
      return { success: true, response };
    } catch {
      return { success: false };
    }
  }

  private validateRetryResponse<T>(retryData: T, retryResponse: string, config: GenerationConfig, timings: GenerationTimings, startTime: number): GenerationResult<T> {
    const retryValidation = this.schemaValidatorService.validateOutput(config.outputSchema, retryData, config.promptId, 'generation_retry');

    if (!retryValidation.valid) {
      timings.total = Date.now() - startTime;
      return this.buildValidationFailureResult(retryResponse, retryValidation.errors, 2, timings);
    }

    timings.total = Date.now() - startTime;
    return this.buildSuccessResult(retryData, retryResponse, 2, timings);
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

  private extractErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
