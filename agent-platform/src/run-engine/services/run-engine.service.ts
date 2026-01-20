import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { Run, RunStatusType } from '@agentic-template/dao/src/entities/run.entity';
import { RunStep, StepStatusType } from '@agentic-template/dao/src/entities/run-step.entity';
import { WorkflowSpec } from '../interfaces/workflow-spec.interface';
import { RunContext, createRunContext } from '../interfaces/run-context.interface';
import { InputHasherService } from './input-hasher.service';
import { DependencyGraphService } from './dependency-graph.service';

export interface RunOrchestrationJobData {
  runId: string;
  tenantId: string;
}

@Injectable()
export class RunEngineService {
  private readonly logger = new Logger(RunEngineService.name);

  constructor(
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    @InjectRepository(RunStep)
    private readonly runStepRepository: Repository<RunStep>,
    private readonly tenantClsService: TenantClsService,
    private readonly inputHasherService: InputHasherService,
    private readonly dependencyGraphService: DependencyGraphService,
  ) {}

  async createRunSteps(runId: string, tenantId: string, workflow: WorkflowSpec, triggerPayload: Record<string, unknown>): Promise<void> {
    const context = createRunContext({
      runId,
      tenantId,
      workflowName: workflow.workflowName,
      triggerPayload,
    });

    const sortedSteps = this.dependencyGraphService.topologicalSort(workflow.steps);
    const runSteps: RunStep[] = [];

    for (const stepSpec of sortedSteps) {
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

  computeStepInput(stepSpec: { inputSelector: (ctx: RunContext) => Record<string, unknown> }, context: RunContext): Record<string, unknown> {
    try {
      return stepSpec.inputSelector(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to compute input for step: ${message}`);
      return {};
    }
  }

  async getRun(runId: string): Promise<Run | null> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.runRepository.findOne({
      where: { id: runId, tenantId },
    });
  }

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

  async getRunStepByStepId(runId: string, stepId: string): Promise<RunStep | null> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.runStepRepository.findOne({
      where: { runId, stepId, tenantId },
    });
  }

  async updateRunStepInputHash(stepId: string, inputHash: string): Promise<void> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    await this.runStepRepository.update({ id: stepId, tenantId }, { inputHash });
  }

  async incrementStepAttempt(stepId: string): Promise<void> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    await this.runStepRepository.increment({ id: stepId, tenantId }, 'attempt', 1);
  }
}
