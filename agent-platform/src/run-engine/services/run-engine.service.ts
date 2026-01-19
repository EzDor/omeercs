import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';

// Entities
import { Run, RunStatusType, RunTriggerType } from '@agentic-template/dao/src/entities/run.entity';
import { RunStep, StepStatusType } from '@agentic-template/dao/src/entities/run-step.entity';

// Interfaces
import { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { RunContext, createRunContext, StepOutput } from '../interfaces/run-context.interface';

// Services
import { WorkflowRegistryService } from './workflow-registry.service';
import { InputHasherService } from './input-hasher.service';
import { DependencyGraphService } from './dependency-graph.service';

/**
 * Job data for the run orchestration queue
 */
export interface RunOrchestrationJobData {
  runId: string;
  tenantId: string;
}

/**
 * Main service for the Run Engine.
 * Handles triggering runs, creating run steps, and computing step inputs.
 */
@Injectable()
export class RunEngineService {
  private readonly logger = new Logger(RunEngineService.name);

  constructor(
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    @InjectRepository(RunStep)
    private readonly runStepRepository: Repository<RunStep>,
    @InjectQueue(QueueNames.RUN_ORCHESTRATION)
    private readonly orchestrationQueue: Queue<RunOrchestrationJobData>,
    private readonly tenantClsService: TenantClsService,
    private readonly workflowRegistryService: WorkflowRegistryService,
    private readonly inputHasherService: InputHasherService,
    private readonly dependencyGraphService: DependencyGraphService,
  ) {}

  /**
   * Trigger a new workflow run.
   *
   * @param workflowName Name of the workflow to execute
   * @param triggerPayload Input data for the workflow
   * @param workflowVersion Optional specific version
   * @returns The created run ID
   */
  async trigger(workflowName: string, triggerPayload: Record<string, unknown> = {}, workflowVersion?: string): Promise<string> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // 1. Get workflow definition
    const workflow = this.workflowRegistryService.getWorkflow(workflowName, workflowVersion);
    if (!workflow) {
      throw new Error(`Workflow '${workflowName}' not found`);
    }

    // 2. Create run record
    const run = this.runRepository.create({
      tenantId,
      workflowName: workflow.workflowName,
      workflowVersion: workflow.version,
      triggerType: 'initial' as RunTriggerType,
      triggerPayload,
      status: 'queued' as RunStatusType,
    });

    const savedRun = await this.runRepository.save(run);
    this.logger.log(`Run created: ${savedRun.id} for workflow ${workflowName}`);

    // 3. Create run steps
    await this.createRunSteps(savedRun.id, tenantId, workflow, triggerPayload);

    // 4. Enqueue for orchestration
    await this.orchestrationQueue.add(
      'orchestrate',
      {
        runId: savedRun.id,
        tenantId,
      },
      {
        jobId: `run-${savedRun.id}`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(`Run ${savedRun.id} queued for orchestration`);

    return savedRun.id;
  }

  /**
   * Create RunStep records for all workflow steps.
   *
   * @param runId The run ID
   * @param tenantId The tenant ID
   * @param workflow The workflow specification
   * @param triggerPayload The trigger payload for input computation
   */
  async createRunSteps(runId: string, tenantId: string, workflow: WorkflowSpec, triggerPayload: Record<string, unknown>): Promise<void> {
    // Create initial run context for input computation
    const context = createRunContext({
      runId,
      tenantId,
      workflowName: workflow.workflowName,
      triggerPayload,
    });

    // Create steps in topological order
    const sortedSteps = this.dependencyGraphService.topologicalSort(workflow.steps);

    const runSteps: RunStep[] = [];

    for (const stepSpec of sortedSteps) {
      // Compute initial input hash (will be recomputed during execution when dependencies complete)
      const initialInput = this.computeStepInput(stepSpec, context);
      const inputHash = this.inputHasherService.computeHash(initialInput);

      const runStep = this.runStepRepository.create({
        runId,
        tenantId,
        stepId: stepSpec.stepId,
        skillId: stepSpec.skillId,
        status: 'pending' as StepStatusType,
        inputHash,
        attempt: 1,
        cacheHit: false,
      });

      runSteps.push(runStep);
    }

    await this.runStepRepository.save(runSteps);
    this.logger.log(`Created ${runSteps.length} run steps for run ${runId}`);
  }

  /**
   * Compute the input for a step using its inputSelector function.
   *
   * @param stepSpec The step specification
   * @param context The run context
   * @returns The computed input object
   */
  computeStepInput(stepSpec: { inputSelector: (ctx: RunContext) => Record<string, unknown> }, context: RunContext): Record<string, unknown> {
    try {
      return stepSpec.inputSelector(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to compute input for step: ${message}`);
      return {};
    }
  }

  /**
   * Get a run by ID.
   *
   * @param runId The run ID
   * @returns The run entity or null
   */
  async getRun(runId: string): Promise<Run | null> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.runRepository.findOne({
      where: { id: runId, tenantId },
    });
  }

  /**
   * Get run with steps summary.
   *
   * @param runId The run ID
   * @returns Run with step counts or null
   */
  async getRunWithSummary(runId: string): Promise<(Run & { stepsSummary: Record<string, number> }) | null> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });

    if (!run) {
      return null;
    }

    // Get step counts by status
    const steps = await this.runStepRepository.find({
      where: { runId, tenantId },
    });

    const stepsSummary = {
      total: steps.length,
      pending: steps.filter((s) => s.status === 'pending').length,
      running: steps.filter((s) => s.status === 'running').length,
      completed: steps.filter((s) => s.status === 'completed').length,
      skipped: steps.filter((s) => s.status === 'skipped').length,
      failed: steps.filter((s) => s.status === 'failed').length,
    };

    return { ...run, stepsSummary };
  }

  /**
   * Get all steps for a run.
   *
   * @param runId The run ID
   * @param statusFilter Optional status filter
   * @returns Array of run steps
   */
  async getRunSteps(runId: string, statusFilter?: StepStatusType): Promise<RunStep[]> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const where: { runId: string; tenantId: string; status?: StepStatusType } = {
      runId,
      tenantId,
    };

    if (statusFilter) {
      where.status = statusFilter;
    }

    return this.runStepRepository.find({
      where,
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Update run status.
   *
   * @param runId The run ID
   * @param status New status
   * @param error Optional error details
   */
  async updateRunStatus(runId: string, status: RunStatusType, error?: { code: string; message: string; failedStepId?: string }): Promise<void> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const run = await this.runRepository.findOne({ where: { id: runId, tenantId } });
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    run.status = status;

    if (status === 'running') {
      run.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      run.completedAt = new Date();
    }

    if (error) {
      run.error = {
        code: error.code,
        message: error.message,
        failedStepId: error.failedStepId,
        timestamp: new Date().toISOString(),
      };
    }

    await this.runRepository.save(run);
  }

  /**
   * Update run step status.
   *
   * @param stepId The run step ID
   * @param status New status
   * @param data Additional update data
   */
  async updateRunStepStatus(
    stepId: string,
    status: StepStatusType,
    data?: {
      outputArtifactIds?: string[];
      error?: { code: string; message: string; attempt: number; details?: Record<string, unknown> };
      cacheHit?: boolean;
      durationMs?: number;
    },
  ): Promise<void> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const step = await this.runStepRepository.findOne({ where: { id: stepId, tenantId } });
    if (!step) {
      throw new Error(`RunStep ${stepId} not found`);
    }

    step.status = status;

    if (status === 'running') {
      step.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed' || status === 'skipped') {
      step.endedAt = new Date();
    }

    if (data?.outputArtifactIds) {
      step.outputArtifactIds = data.outputArtifactIds;
    }

    if (data?.error) {
      step.error = {
        code: data.error.code,
        message: data.error.message,
        attempt: data.error.attempt,
        timestamp: new Date().toISOString(),
        details: data.error.details,
      };
    }

    if (data?.cacheHit !== undefined) {
      step.cacheHit = data.cacheHit;
    }

    if (data?.durationMs !== undefined) {
      step.durationMs = data.durationMs;
    }

    await this.runStepRepository.save(step);
  }

  /**
   * Get a run step by ID.
   *
   * @param stepId The run step ID
   * @returns The run step or null
   */
  async getRunStep(stepId: string): Promise<RunStep | null> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.runStepRepository.findOne({
      where: { id: stepId, tenantId },
    });
  }

  /**
   * Get a run step by run ID and step ID.
   *
   * @param runId The run ID
   * @param stepId The step ID (from workflow definition)
   * @returns The run step or null
   */
  async getRunStepByStepId(runId: string, stepId: string): Promise<RunStep | null> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.runStepRepository.findOne({
      where: { runId, stepId, tenantId },
    });
  }

  /**
   * Build run context from completed steps.
   *
   * @param runId The run ID
   * @param workflow The workflow specification
   * @param triggerPayload The original trigger payload
   * @returns The run context with step outputs populated
   */
  async buildRunContext(runId: string, workflow: WorkflowSpec, triggerPayload: Record<string, unknown>): Promise<RunContext> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const context = createRunContext({
      runId,
      tenantId,
      workflowName: workflow.workflowName,
      triggerPayload,
    });

    // Get completed and skipped steps
    const completedSteps = await this.runStepRepository.find({
      where: {
        runId,
        tenantId,
        status: In(['completed', 'skipped']),
      },
    });

    // Populate step outputs
    for (const step of completedSteps) {
      const output: StepOutput = {
        stepId: step.stepId,
        status: step.status as 'completed' | 'skipped' | 'failed',
        outputArtifactIds: step.outputArtifactIds || [],
      };

      context.stepOutputs.set(step.stepId, output);
      context.artifacts.set(step.stepId, step.outputArtifactIds || []);
    }

    return context;
  }

  /**
   * Increment retry attempt for a step.
   *
   * @param stepId The run step ID
   */
  async incrementStepAttempt(stepId: string): Promise<void> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    await this.runStepRepository.increment({ id: stepId, tenantId }, 'attempt', 1);
  }
}
