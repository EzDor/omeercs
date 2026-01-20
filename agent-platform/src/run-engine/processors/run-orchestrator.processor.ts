import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { RunEngineService, RunOrchestrationJobData } from '../services/run-engine.service';
import { WorkflowRegistryService } from '../services/workflow-registry.service';
import { DependencyGraphService } from '../services/dependency-graph.service';
import { InputHasherService } from '../services/input-hasher.service';
import { StepCacheService } from '../services/step-cache.service';
import { SkillRunnerService } from '../../skills/skill-runner/skill-runner.service';
import { StepSpec } from '../interfaces/step-spec.interface';
import { RunContext } from '../interfaces/run-context.interface';

@Processor(QueueNames.RUN_ORCHESTRATION, { concurrency: 1 })
export class RunOrchestratorProcessor extends WorkerHost {
  private readonly logger = new Logger(RunOrchestratorProcessor.name);

  constructor(
    private readonly runEngineService: RunEngineService,
    private readonly workflowRegistryService: WorkflowRegistryService,
    private readonly dependencyGraphService: DependencyGraphService,
    private readonly inputHasherService: InputHasherService,
    private readonly stepCacheService: StepCacheService,
    private readonly skillRunnerService: SkillRunnerService,
    private readonly tenantClsService: TenantClsService,
  ) {
    super();
  }

  async process(job: Job<RunOrchestrationJobData>): Promise<void> {
    const { runId, tenantId } = job.data;

    this.logger.log(`[RunEngine] Run started: runId=${runId}`);

    await this.tenantClsService.runWithTenant(tenantId, undefined, async () => {
      try {
        const run = await this.runEngineService.getRun(runId);
        if (!run) {
          throw new Error(`Run ${runId} not found`);
        }

        const workflow = this.workflowRegistryService.getWorkflow(run.workflowName, run.workflowVersion);
        if (!workflow) {
          throw new Error(`Workflow ${run.workflowName} v${run.workflowVersion} not found`);
        }

        const existingSteps = await this.runEngineService.getRunSteps(runId);
        if (existingSteps.length === 0) {
          this.logger.log(`[RunEngine] Creating run steps for run ${runId}`);
          await this.runEngineService.createRunSteps(runId, tenantId, workflow, run.triggerPayload || {});
        }

        await this.runEngineService.updateRunStatus(runId, 'running');
        await this.executeWorkflow(runId, tenantId, workflow);

        const steps = await this.runEngineService.getRunSteps(runId);
        const failedSteps = steps.filter((s) => s.status === 'failed');

        if (failedSteps.length > 0) {
          const failedStep = failedSteps[0];
          await this.runEngineService.updateRunStatus(runId, 'failed', {
            code: 'STEP_EXECUTION_FAILED',
            message: `Step ${failedStep.stepId} failed after ${failedStep.attempt} attempts`,
            failedStepId: failedStep.stepId,
          });
          this.logger.log(`[RunEngine] Run failed: runId=${runId}, failedStep=${failedStep.stepId}`);
        } else {
          await this.runEngineService.updateRunStatus(runId, 'completed');
          this.logger.log(`[RunEngine] Run completed: runId=${runId}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`[RunEngine] Run failed with error: runId=${runId}, error=${message}`);
        await this.runEngineService.updateRunStatus(runId, 'failed', {
          code: 'ORCHESTRATION_ERROR',
          message,
        });
        throw error;
      }
    });
  }

  private async executeWorkflow(runId: string, tenantId: string, workflow: { workflowName: string; version: string; steps: StepSpec[] }): Promise<void> {
    const totalSteps = workflow.steps.length;
    let completedCount = 0;

    while (completedCount < totalSteps) {
      const steps = await this.runEngineService.getRunSteps(runId);
      const completedStepIds = new Set(steps.filter((s) => s.status === 'completed' || s.status === 'skipped').map((s) => s.stepId));
      const pendingStepIds = new Set(steps.filter((s) => s.status === 'pending').map((s) => s.stepId));

      const hasFailedSteps = steps.some((s) => s.status === 'failed');
      if (hasFailedSteps) {
        break;
      }

      const readySteps = this.dependencyGraphService.getReadySteps(workflow.steps, completedStepIds, pendingStepIds);

      if (readySteps.length === 0 && pendingStepIds.size > 0) {
        throw new Error('No ready steps but pending steps remain - possible dependency cycle');
      }

      if (readySteps.length === 0) {
        break;
      }

      const run = await this.runEngineService.getRun(runId);
      const context = await this.runEngineService.buildRunContext(runId, workflow, run?.triggerPayload || {});
      const results = await Promise.allSettled(readySteps.map((stepSpec) => this.executeStep(runId, tenantId, stepSpec, context)));

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const stepSpec = readySteps[i];

        if (result.status === 'fulfilled') {
          completedCount++;
        } else {
          this.logger.error(`[RunEngine] Step execution promise rejected: stepId=${stepSpec.stepId}, error=${result.reason}`);
        }
      }
    }
  }

  private async executeStep(runId: string, tenantId: string, stepSpec: StepSpec, context: RunContext): Promise<void> {
    const runStep = await this.runEngineService.getRunStepByStepId(runId, stepSpec.stepId);
    if (!runStep) {
      throw new Error(`RunStep not found for run ${runId}, step ${stepSpec.stepId}`);
    }

    this.logger.log(`[RunEngine] Step started: runId=${runId}, stepId=${stepSpec.stepId}`);
    await this.runEngineService.updateRunStepStatus(runStep.id, 'running');

    const startTime = Date.now();
    const input = this.runEngineService.computeStepInput(stepSpec, context);
    const inputHash = this.inputHasherService.computeHash(input);

    if (inputHash !== runStep.inputHash) {
      this.logger.debug(`Input hash updated for step ${stepSpec.stepId}: ${runStep.inputHash} -> ${inputHash}`);
      await this.runEngineService.updateRunStepInputHash(runStep.id, inputHash);
    }

    const cacheKey = this.inputHasherService.createCacheKeyFromHash(context.workflowName, stepSpec.stepId, inputHash);
    if (stepSpec.cachePolicy.enabled) {
      const cachedArtifactIds = await this.stepCacheService.get(cacheKey);
      if (cachedArtifactIds) {
        const durationMs = Date.now() - startTime;
        await this.runEngineService.updateRunStepStatus(runStep.id, 'completed', {
          outputArtifactIds: cachedArtifactIds,
          cacheHit: true,
          durationMs,
        });
        this.logger.log(`[RunEngine] Step completed (cache hit): runId=${runId}, stepId=${stepSpec.stepId}, durationMs=${durationMs}`);
        return;
      }
    }

    const { maxAttempts, backoffMs } = stepSpec.retryPolicy;
    let currentAttempt = runStep.attempt;
    let lastError: { code: string; message: string } | null = null;

    while (currentAttempt <= maxAttempts) {
      try {
        const result = await this.skillRunnerService.execute(stepSpec.skillId, input);

        if (result.ok) {
          const durationMs = Date.now() - startTime;
          const artifactIds = result.artifacts?.map((a) => (a.metadata?.id as string) || '').filter(Boolean) || [];

          await this.runEngineService.updateRunStepStatus(runStep.id, 'completed', {
            outputArtifactIds: artifactIds,
            durationMs,
          });

          if (stepSpec.cachePolicy.enabled && artifactIds.length > 0) {
            await this.stepCacheService.set({
              cacheKey,
              workflowName: context.workflowName,
              stepId: stepSpec.stepId,
              inputHash,
              artifactIds,
              scope: stepSpec.cachePolicy.scope,
            });
          }

          this.logger.log(`[RunEngine] Step completed: runId=${runId}, stepId=${stepSpec.stepId}, durationMs=${durationMs}, attempt=${currentAttempt}`);
          return;
        }

        lastError = {
          code: result.error_code || 'SKILL_ERROR',
          message: result.error || 'Unknown skill error',
        };
        this.logger.warn(`[RunEngine] Step attempt ${currentAttempt}/${maxAttempts} failed: runId=${runId}, stepId=${stepSpec.stepId}, error=${lastError.code}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        lastError = { code: 'EXECUTION_ERROR', message };
        this.logger.warn(`[RunEngine] Step attempt ${currentAttempt}/${maxAttempts} threw exception: runId=${runId}, stepId=${stepSpec.stepId}, error=${message}`);
      }

      if (currentAttempt < maxAttempts) {
        const delay = backoffMs * Math.pow(2, currentAttempt - 1);
        this.logger.debug(`[RunEngine] Retrying step ${stepSpec.stepId} in ${delay}ms (attempt ${currentAttempt + 1}/${maxAttempts})`);
        await this.delay(delay);
        await this.runEngineService.incrementStepAttempt(runStep.id);
        currentAttempt++;
      } else {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    await this.runEngineService.updateRunStepStatus(runStep.id, 'failed', {
      error: {
        code: lastError?.code || 'UNKNOWN_ERROR',
        message: lastError?.message || 'Unknown error',
        attempt: currentAttempt,
      },
      durationMs,
    });

    this.logger.error(`[RunEngine] Step failed after ${currentAttempt} attempts: runId=${runId}, stepId=${stepSpec.stepId}, error=${lastError?.code}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
