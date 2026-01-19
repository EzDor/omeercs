import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';

// Services
import { RunEngineService, RunOrchestrationJobData } from '../services/run-engine.service';
import { WorkflowRegistryService } from '../services/workflow-registry.service';
import { DependencyGraphService } from '../services/dependency-graph.service';
import { InputHasherService } from '../services/input-hasher.service';
import { SkillRunnerService } from '../../skills/skill-runner/skill-runner.service';

// Interfaces
import { StepSpec } from '../interfaces/step-spec.interface';
import { RunContext } from '../interfaces/run-context.interface';

/**
 * BullMQ processor for orchestrating workflow run execution.
 * Executes steps in topological order, handling parallelism for independent steps.
 */
@Processor(QueueNames.RUN_ORCHESTRATION, { concurrency: 1 })
export class RunOrchestratorProcessor extends WorkerHost {
  private readonly logger = new Logger(RunOrchestratorProcessor.name);

  constructor(
    private readonly runEngineService: RunEngineService,
    private readonly workflowRegistryService: WorkflowRegistryService,
    private readonly dependencyGraphService: DependencyGraphService,
    private readonly inputHasherService: InputHasherService,
    private readonly skillRunnerService: SkillRunnerService,
    private readonly tenantClsService: TenantClsService,
  ) {
    super();
  }

  /**
   * Process a run orchestration job.
   */
  async process(job: Job<RunOrchestrationJobData>): Promise<void> {
    const { runId, tenantId } = job.data;

    this.logger.log(`[RunEngine] Run started: runId=${runId}`);

    // Set tenant context for this job
    await this.tenantClsService.runWithTenant(tenantId, undefined, async () => {
      try {
        // 1. Get the run
        const run = await this.runEngineService.getRun(runId);
        if (!run) {
          throw new Error(`Run ${runId} not found`);
        }

        // 2. Get workflow definition
        const workflow = this.workflowRegistryService.getWorkflow(run.workflowName, run.workflowVersion);
        if (!workflow) {
          throw new Error(`Workflow ${run.workflowName} v${run.workflowVersion} not found`);
        }

        // 3. Update run status to running
        await this.runEngineService.updateRunStatus(runId, 'running');

        // 4. Execute steps in topological order
        await this.executeWorkflow(runId, tenantId, workflow);

        // 5. Check final status
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

  /**
   * Execute the workflow by processing steps in topological order.
   */
  private async executeWorkflow(runId: string, tenantId: string, workflow: { workflowName: string; version: string; steps: StepSpec[] }): Promise<void> {
    const totalSteps = workflow.steps.length;
    let completedCount = 0;

    // Keep executing until all steps are done or a failure occurs
    while (completedCount < totalSteps) {
      // Get current step statuses
      const steps = await this.runEngineService.getRunSteps(runId);

      // Find completed/skipped step IDs
      const completedStepIds = new Set(steps.filter((s) => s.status === 'completed' || s.status === 'skipped').map((s) => s.stepId));

      // Find pending step IDs
      const pendingStepIds = new Set(steps.filter((s) => s.status === 'pending').map((s) => s.stepId));

      // Check for failed steps - stop execution
      const hasFailedSteps = steps.some((s) => s.status === 'failed');
      if (hasFailedSteps) {
        break;
      }

      // Get steps ready to execute (all dependencies satisfied)
      const readySteps = this.dependencyGraphService.getReadySteps(workflow.steps, completedStepIds, pendingStepIds);

      if (readySteps.length === 0 && pendingStepIds.size > 0) {
        // Deadlock - should not happen with valid DAG
        throw new Error('No ready steps but pending steps remain - possible dependency cycle');
      }

      if (readySteps.length === 0) {
        // All done
        break;
      }

      // Build run context with completed step outputs
      const run = await this.runEngineService.getRun(runId);
      const context = await this.runEngineService.buildRunContext(runId, workflow, run?.triggerPayload || {});

      // Execute ready steps in parallel
      const results = await Promise.allSettled(readySteps.map((stepSpec) => this.executeStep(runId, tenantId, stepSpec, context)));

      // Process results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const stepSpec = readySteps[i];

        if (result.status === 'fulfilled') {
          completedCount++;
        } else {
          this.logger.error(`[RunEngine] Step execution promise rejected: stepId=${stepSpec.stepId}, error=${result.reason}`);
          // Step failure is already recorded in executeStep
        }
      }
    }
  }

  /**
   * Execute a single step.
   */
  private async executeStep(runId: string, tenantId: string, stepSpec: StepSpec, context: RunContext): Promise<void> {
    // Get the run step record
    const runStep = await this.runEngineService.getRunStepByStepId(runId, stepSpec.stepId);
    if (!runStep) {
      throw new Error(`RunStep not found for run ${runId}, step ${stepSpec.stepId}`);
    }

    this.logger.log(`[RunEngine] Step started: runId=${runId}, stepId=${stepSpec.stepId}`);

    // Mark step as running
    await this.runEngineService.updateRunStepStatus(runStep.id, 'running');

    const startTime = Date.now();

    try {
      // Compute actual input with all dependencies resolved
      const input = this.runEngineService.computeStepInput(stepSpec, context);
      const inputHash = this.inputHasherService.computeHash(input);

      // Update input hash if it changed
      if (inputHash !== runStep.inputHash) {
        // Input changed after dependencies completed - this is expected
        this.logger.debug(`Input hash updated for step ${stepSpec.stepId}: ${runStep.inputHash} -> ${inputHash}`);
      }

      // Execute the skill
      const result = await this.skillRunnerService.execute(stepSpec.skillId, input);

      const durationMs = Date.now() - startTime;

      if (result.ok) {
        // Extract artifact IDs from result
        const artifactIds = result.artifacts?.map((a) => (a.metadata?.id as string) || '').filter(Boolean) || [];

        await this.runEngineService.updateRunStepStatus(runStep.id, 'completed', {
          outputArtifactIds: artifactIds,
          durationMs,
        });

        this.logger.log(`[RunEngine] Step completed: runId=${runId}, stepId=${stepSpec.stepId}, durationMs=${durationMs}`);
      } else {
        // Skill execution failed
        await this.runEngineService.updateRunStepStatus(runStep.id, 'failed', {
          error: {
            code: result.error_code || 'SKILL_ERROR',
            message: result.error || 'Unknown skill error',
            attempt: runStep.attempt,
          },
          durationMs,
        });

        this.logger.log(`[RunEngine] Step failed: runId=${runId}, stepId=${stepSpec.stepId}, error=${result.error_code}, attempt=${runStep.attempt}`);
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';

      await this.runEngineService.updateRunStepStatus(runStep.id, 'failed', {
        error: {
          code: 'EXECUTION_ERROR',
          message,
          attempt: runStep.attempt,
        },
        durationMs,
      });

      this.logger.error(`[RunEngine] Step failed with exception: runId=${runId}, stepId=${stepSpec.stepId}, error=${message}`);
    }
  }
}
