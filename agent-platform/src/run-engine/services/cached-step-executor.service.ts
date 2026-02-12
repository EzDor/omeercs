import { Injectable, Logger } from '@nestjs/common';
import { StepSpec } from '../interfaces/step-spec.interface';
import { RunStateType, StepResult } from '../interfaces/langgraph-run-state.interface';
import { RunContext, StepOutput } from '../interfaces/run-context.interface';
import { InputHasherService } from './input-hasher.service';
import { StepCacheService } from './step-cache.service';
import { RunEngineService } from './run-engine.service';
import { SkillRunnerService } from '../../skills/skill-runner/skill-runner.service';
import { SkillResult } from '@agentic-template/dto/src/skills/skill-result.interface';

@Injectable()
export class CachedStepExecutorService {
  private readonly logger = new Logger(CachedStepExecutorService.name);

  constructor(
    private readonly inputHasherService: InputHasherService,
    private readonly stepCacheService: StepCacheService,
    private readonly runEngineService: RunEngineService,
    private readonly skillRunnerService: SkillRunnerService,
  ) {}

  createNodeFunction(stepSpec: StepSpec): (state: RunStateType) => Promise<Partial<RunStateType>> {
    return async (state: RunStateType): Promise<Partial<RunStateType>> => {
      const startTime = Date.now();
      const { runId, workflowName } = state;

      this.logger.log(`[CachedStep] Starting step: ${stepSpec.stepId}, runId=${runId}`);

      const context = this.buildRunContext(state);
      let input: Record<string, unknown>;

      try {
        input = stepSpec.inputSelector(context);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`[CachedStep] Failed to compute input for step ${stepSpec.stepId}: ${message}`);
        return this.buildFailureUpdate(stepSpec.stepId, startTime, 'INPUT_SELECTOR_ERROR', message);
      }

      const inputHash = this.inputHasherService.computeHash(input);
      const cacheKey = this.inputHasherService.createCacheKeyFromHash(workflowName, stepSpec.stepId, inputHash);

      const runStep = await this.runEngineService.getRunStepByStepId(runId, stepSpec.stepId);
      if (runStep) {
        await this.runEngineService.updateRunStepStatus(runStep.id, 'running');
        if (inputHash !== runStep.inputHash) {
          await this.runEngineService.updateRunStepInputHash(runStep.id, inputHash);
        }
      }

      if (stepSpec.cachePolicy.enabled) {
        const cached = await this.stepCacheService.get(cacheKey);
        if (cached) {
          const durationMs = Date.now() - startTime;

          if (runStep) {
            await this.runEngineService.updateRunStepStatus(runStep.id, 'completed', {
              outputArtifactIds: cached.artifactIds,
              cacheHit: true,
              durationMs,
            });
          }

          this.logger.log(`[CachedStep] Cache hit: stepId=${stepSpec.stepId}, durationMs=${durationMs}`);

          return this.buildSuccessUpdate(stepSpec.stepId, cached.artifactIds, true, durationMs, cached.data);
        }
      }

      const result = await this.executeWithRetry(stepSpec, input, runStep?.id);
      const durationMs = Date.now() - startTime;

      if (result.ok) {
        const artifactIds = result.artifacts?.map((a) => (a.metadata?.id as string) || '').filter(Boolean) || [];

        if (runStep) {
          await this.runEngineService.updateRunStepStatus(runStep.id, 'completed', {
            outputArtifactIds: artifactIds,
            durationMs,
          });
        }

        if (stepSpec.cachePolicy.enabled && artifactIds.length > 0) {
          await this.stepCacheService.set({
            cacheKey,
            workflowName,
            stepId: stepSpec.stepId,
            inputHash,
            artifactIds,
            data: result.data as Record<string, unknown> | undefined,
            scope: stepSpec.cachePolicy.scope,
          });
        }

        this.logger.log(`[CachedStep] Completed: stepId=${stepSpec.stepId}, durationMs=${durationMs}`);

        return this.buildSuccessUpdate(stepSpec.stepId, artifactIds, false, durationMs, result.data as Record<string, unknown> | undefined);
      }

      if (runStep) {
        await this.runEngineService.updateRunStepStatus(runStep.id, 'failed', {
          error: {
            code: result.error_code || 'SKILL_ERROR',
            message: result.error || 'Unknown error',
            attempt: stepSpec.retryPolicy.maxAttempts,
          },
          durationMs,
        });
      }

      this.logger.error(`[CachedStep] Failed: stepId=${stepSpec.stepId}, error=${result.error_code}`);

      return this.buildFailureUpdate(stepSpec.stepId, startTime, result.error_code || 'SKILL_ERROR', result.error || 'Unknown error');
    };
  }

  private buildRunContext(state: RunStateType): RunContext {
    const stepOutputs = new Map<string, StepOutput>();

    for (const [stepId, result] of state.stepResults) {
      stepOutputs.set(stepId, {
        stepId,
        status: result.status,
        outputArtifactIds: result.artifactIds,
        data: result.data,
      });
    }

    return {
      runId: state.runId,
      tenantId: state.tenantId,
      workflowName: state.workflowName,
      triggerPayload: state.triggerPayload,
      stepOutputs,
      artifacts: state.artifacts,
    };
  }

  private buildSuccessUpdate(stepId: string, artifactIds: string[], cacheHit: boolean, durationMs: number, data?: Record<string, unknown>): Partial<RunStateType> {
    const stepResult: StepResult = {
      stepId,
      status: 'completed',
      artifactIds,
      data,
      cacheHit,
      durationMs,
    };

    return {
      stepResults: new Map([[stepId, stepResult]]),
      artifacts: new Map([[stepId, artifactIds]]),
    };
  }

  private buildFailureUpdate(stepId: string, startTime: number, errorCode: string, errorMessage: string): Partial<RunStateType> {
    const durationMs = Date.now() - startTime;

    const stepResult: StepResult = {
      stepId,
      status: 'failed',
      artifactIds: [],
      cacheHit: false,
      durationMs,
      error: { code: errorCode, message: errorMessage },
    };

    return {
      stepResults: new Map([[stepId, stepResult]]),
      artifacts: new Map([[stepId, []]]),
      error: `Step ${stepId} failed: ${errorMessage}`,
    };
  }

  private async executeWithRetry(stepSpec: StepSpec, input: Record<string, unknown>, runStepId?: string): Promise<SkillResult> {
    const { maxAttempts, backoffMs } = stepSpec.retryPolicy;
    let lastResult: SkillResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.skillRunnerService.execute(stepSpec.skillId, input);

        if (result.ok) {
          return result;
        }

        lastResult = result;
        this.logger.warn(`[CachedStep] Attempt ${attempt}/${maxAttempts} failed: stepId=${stepSpec.stepId}, error=${result.error_code}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        lastResult = {
          ok: false,
          error: message,
          error_code: 'EXECUTION_ERROR',
          artifacts: [],
          debug: { timings_ms: { total: 0 } },
        };
        this.logger.warn(`[CachedStep] Attempt ${attempt}/${maxAttempts} threw: stepId=${stepSpec.stepId}, error=${message}`);
      }

      if (attempt < maxAttempts) {
        const delay = backoffMs * Math.pow(2, attempt - 1);
        this.logger.debug(`[CachedStep] Retrying step ${stepSpec.stepId} in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
        await this.delay(delay);

        if (runStepId) {
          await this.runEngineService.incrementStepAttempt(runStepId);
        }
      }
    }

    return (
      lastResult || {
        ok: false,
        error: 'Max attempts exceeded',
        error_code: 'MAX_RETRIES',
        artifacts: [],
        debug: { timings_ms: { total: 0 } },
      }
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
