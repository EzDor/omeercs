import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { SkillResult, SkillDebugInfo, skillSuccess } from '@agentic-template/dto/src/skills/skill-result.interface';
import type { SkillDescriptor, LlmJsonGenerationTemplateConfig } from '@agentic-template/dto/src/skills/skill-descriptor.interface';
import { SkillCatalogService } from '../services/skill-catalog.service';
import { WorkspaceService } from './services/workspace.service';
import { ExecutionContextService } from './services/execution-context.service';
import { SchemaValidatorService } from './services/schema-validator.service';
import { LlmGenerationService } from './services/llm-generation.service';
import { SkillExecutionOptions, EnhancedSkillExecutionContext } from './interfaces/execution-context.interface';
import { SkillTimeoutException } from './exceptions/skill-timeout.exception';
import type { GenerationInput, GenerationConfig } from './interfaces/generation-result.interface';

/**
 * Service for executing skills with full lifecycle management.
 * Handles validation, context creation, timeout enforcement, and cleanup.
 */
@Injectable()
export class SkillRunnerService {
  private readonly logger = new Logger(SkillRunnerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantClsService: TenantClsService,
    private readonly catalogService: SkillCatalogService,
    private readonly workspaceService: WorkspaceService,
    private readonly executionContextService: ExecutionContextService,
    private readonly schemaValidatorService: SchemaValidatorService,
    private readonly llmGenerationService: LlmGenerationService,
  ) {}

  /**
   * Execute a skill by ID with the given input.
   *
   * @param skillId The skill identifier
   * @param input The input data for the skill
   * @param options Optional execution options (version, timeout, provider)
   * @returns SkillResult with output data or error information
   */
  async execute<TInput = unknown, TOutput = unknown>(skillId: string, input: TInput, options?: SkillExecutionOptions): Promise<SkillResult<TOutput>> {
    const startTime = Date.now();
    let workspaceDir: string | undefined;
    let runId: string | undefined;

    const timings: { total: number; [step: string]: number } = {
      total: 0,
      input_validation: 0,
      execution: 0,
      output_validation: 0,
      artifact_registration: 0,
    };

    try {
      // 1. Get skill descriptor (with version resolution)
      const descriptor = this.catalogService.getSkill(skillId, options?.version);
      if (!descriptor) {
        const errorMsg = options?.version ? `Skill '${skillId}' version '${options.version}' not found` : `Skill '${skillId}' not found`;
        timings.total = Date.now() - startTime;
        return this.createErrorResult<TOutput>(options?.version ? 'VERSION_NOT_FOUND' : 'SKILL_NOT_FOUND', errorMsg, skillId, options?.version || 'unknown', 'unknown', timings);
      }

      // 2. Check for template type routing (LLM-based skill patterns)
      if (descriptor.template_type) {
        return this.executeTemplateSkill<TInput, TOutput>(descriptor, input, options, timings, startTime);
      }

      // 3. Get skill handler (for non-template skills)
      const handler = this.catalogService.getHandler(skillId);
      if (!handler) {
        timings.total = Date.now() - startTime;
        return this.createErrorResult<TOutput>('HANDLER_NOT_FOUND', `Handler not registered for skill: ${skillId}`, skillId, descriptor.version, 'unknown', timings);
      }

      // 3. Create workspace
      const tempRunId = this.generateRunId();
      workspaceDir = await this.workspaceService.createWorkspace(tempRunId);

      // 4. Create execution context
      const controller = new AbortController();
      const context = this.executionContextService.createContext(descriptor, workspaceDir, controller.signal, options);
      runId = context.runId;

      // 5. Validate input
      const inputValidationStart = Date.now();
      if (descriptor.input_schema) {
        const inputValidation = this.schemaValidatorService.validateInput(descriptor.input_schema, input, skillId, descriptor.version);

        if (!inputValidation.valid) {
          timings.input_validation = Date.now() - inputValidationStart;
          timings.total = Date.now() - startTime;
          return this.createErrorResult<TOutput>(
            'INPUT_VALIDATION_FAILED',
            `Input validation failed: ${inputValidation.errors.map((e) => e.message).join(', ')}`,
            skillId,
            descriptor.version,
            runId,
            timings,
          );
        }
      }
      timings.input_validation = Date.now() - inputValidationStart;

      // 6. Execute with timeout
      const executionStart = Date.now();
      const timeout = options?.timeout_ms ?? context.policy.timeout_ms;

      let handlerResult: SkillResult<TOutput>;
      try {
        handlerResult = await this.executeWithTimeout<TOutput>(handler, input, context, timeout, controller);
      } catch (error) {
        timings.execution = Date.now() - executionStart;
        timings.total = Date.now() - startTime;

        if (error instanceof SkillTimeoutException) {
          return this.createErrorResult<TOutput>('TIMEOUT', error.message, skillId, descriptor.version, runId, timings);
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
        return this.createErrorResult<TOutput>('EXECUTION_ERROR', errorMessage, skillId, descriptor.version, runId, timings);
      }
      timings.execution = Date.now() - executionStart;

      // 7. Validate output
      const outputValidationStart = Date.now();
      if (handlerResult.ok && descriptor.output_schema && handlerResult.data !== undefined) {
        const outputValidation = this.schemaValidatorService.validateOutput(descriptor.output_schema, handlerResult.data, skillId, descriptor.version);

        if (!outputValidation.valid) {
          timings.output_validation = Date.now() - outputValidationStart;
          timings.total = Date.now() - startTime;
          return this.createErrorResult<TOutput>(
            'OUTPUT_VALIDATION_FAILED',
            `Output validation failed: ${outputValidation.errors.map((e) => e.message).join(', ')}`,
            skillId,
            descriptor.version,
            runId,
            timings,
          );
        }
      }
      timings.output_validation = Date.now() - outputValidationStart;

      // 8. Build final result
      timings.total = Date.now() - startTime;
      const debug: SkillDebugInfo = {
        timings_ms: timings,
      };

      if (handlerResult.ok) {
        return skillSuccess<TOutput>(handlerResult.data as TOutput, handlerResult.artifacts || [], debug);
      }

      // Handler returned error result
      return {
        ok: false,
        error: handlerResult.error,
        error_code: handlerResult.error_code,
        artifacts: handlerResult.artifacts || [],
        debug,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Skill execution failed unexpectedly: ${errorMessage}`, error instanceof Error ? error.stack : undefined);

      timings.total = Date.now() - startTime;
      return this.createErrorResult<TOutput>('EXECUTION_ERROR', errorMessage, skillId, options?.version || 'unknown', runId || 'unknown', timings);
    } finally {
      // 9. Cleanup workspace
      if (workspaceDir) {
        await this.workspaceService.cleanupWorkspace(workspaceDir);
      }
    }
  }

  /**
   * Execute a template-based skill (LLM_JSON_GENERATION or LLM_REVIEW).
   */
  private async executeTemplateSkill<TInput, TOutput>(
    descriptor: SkillDescriptor,
    input: TInput,
    options: SkillExecutionOptions | undefined,
    timings: { total: number; [step: string]: number },
    startTime: number,
  ): Promise<SkillResult<TOutput>> {
    const runId = this.generateRunId();

    // Validate input against skill's input schema
    const inputValidationStart = Date.now();
    if (descriptor.input_schema) {
      const inputValidation = this.schemaValidatorService.validateInput(descriptor.input_schema, input, descriptor.skill_id, descriptor.version);

      if (!inputValidation.valid) {
        timings.input_validation = Date.now() - inputValidationStart;
        timings.total = Date.now() - startTime;
        return this.createErrorResult<TOutput>(
          'INPUT_VALIDATION_FAILED',
          `Input validation failed: ${inputValidation.errors.map((e) => e.message).join(', ')}`,
          descriptor.skill_id,
          descriptor.version,
          runId,
          timings,
        );
      }
    }
    timings.input_validation = Date.now() - inputValidationStart;

    // Route to appropriate template handler
    switch (descriptor.template_type) {
      case 'LLM_JSON_GENERATION':
        return this.executeLlmJsonGeneration<TInput, TOutput>(descriptor, input, timings, startTime, runId);

      case 'LLM_REVIEW':
        // LLM_REVIEW will be implemented in User Story 2
        timings.total = Date.now() - startTime;
        return this.createErrorResult<TOutput>('NOT_IMPLEMENTED', 'LLM_REVIEW template type not yet implemented', descriptor.skill_id, descriptor.version, runId, timings);

      default:
        timings.total = Date.now() - startTime;
        return this.createErrorResult<TOutput>(
          'UNKNOWN_TEMPLATE_TYPE',
          `Unknown template type: ${descriptor.template_type}`,
          descriptor.skill_id,
          descriptor.version,
          runId,
          timings,
        );
    }
  }

  /**
   * Execute LLM_JSON_GENERATION template skill.
   */
  private async executeLlmJsonGeneration<TInput, TOutput>(
    descriptor: SkillDescriptor,
    input: TInput,
    timings: { total: number; [step: string]: number },
    startTime: number,
    runId: string,
  ): Promise<SkillResult<TOutput>> {
    const templateConfig = descriptor.template_config as LlmJsonGenerationTemplateConfig;
    this.logger.debug(`executeLlmJsonGeneration: templateConfig=${JSON.stringify(templateConfig)}`);

    if (!templateConfig?.prompt_id) {
      timings.total = Date.now() - startTime;
      return this.createErrorResult<TOutput>(
        'INVALID_TEMPLATE_CONFIG',
        'LLM_JSON_GENERATION requires prompt_id in template_config',
        descriptor.skill_id,
        descriptor.version,
        runId,
        timings,
      );
    }

    // Build generation input and config
    const generationInput: GenerationInput = {
      variables: input as Record<string, unknown>,
    };

    const generationConfig: GenerationConfig = {
      promptId: templateConfig.prompt_id,
      promptVersion: templateConfig.prompt_version,
      outputSchema: descriptor.output_schema,
      retryOnValidationFailure: templateConfig.retry_on_validation_failure !== false,
      model: templateConfig.model,
      temperature: templateConfig.temperature,
      maxTokens: templateConfig.max_tokens,
    };

    // Execute generation
    const executionStart = Date.now();
    const generationResult = await this.llmGenerationService.generate<TOutput>(generationInput, generationConfig);
    timings.execution = Date.now() - executionStart;
    timings.total = Date.now() - startTime;

    // Convert GenerationResult to SkillResult
    const debug: SkillDebugInfo = {
      timings_ms: {
        ...timings,
        ...generationResult.timings_ms,
      },
    };

    if (generationResult.success) {
      return skillSuccess<TOutput>(generationResult.data as TOutput, [], debug);
    }

    // Generation failed
    const errorMessages = generationResult.validationErrors?.map((e) => e.message).join(', ') || 'Generation failed';
    return {
      ok: false,
      error: errorMessages,
      error_code: 'GENERATION_FAILED',
      artifacts: [],
      debug,
    };
  }

  /**
   * Execute handler with timeout enforcement using AbortController.
   */
  private async executeWithTimeout<TOutput>(
    handler: { execute: (input: unknown, context: EnhancedSkillExecutionContext) => Promise<SkillResult<unknown>> },
    input: unknown,
    context: EnhancedSkillExecutionContext,
    timeoutMs: number,
    controller: AbortController,
  ): Promise<SkillResult<TOutput>> {
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      // Race between handler execution and timeout
      const result = await Promise.race([
        handler.execute(input, context),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => {
              reject(new SkillTimeoutException(context.skillId, timeoutMs));
            },
            { once: true },
          );
        }),
      ]);

      return result as SkillResult<TOutput>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generate a unique run ID.
   */
  private generateRunId(): string {
    // Use uuid from the context service pattern
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Create a standardized error result.
   */
  private createErrorResult<TOutput>(
    errorCode: string,
    errorMessage: string,
    skillId: string,
    version: string,
    runId: string,
    timings: { total: number; [step: string]: number },
  ): SkillResult<TOutput> {
    const debug: SkillDebugInfo = {
      timings_ms: timings,
    };

    return {
      ok: false,
      error: errorMessage,
      error_code: errorCode,
      artifacts: [],
      debug,
    };
  }
}
