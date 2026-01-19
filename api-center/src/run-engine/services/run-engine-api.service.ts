import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';

// Entities
import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { RunStep, StepStatusType } from '@agentic-template/dao/src/entities/run-step.entity';
import { Artifact } from '@agentic-template/dao/src/entities/artifact.entity';

// DTOs
import { TriggerRunRequest, TriggerRunResponse, RunResponse, RunStatus, StepsSummary } from '@agentic-template/dto/src/run-engine/run.dto';
import { RunStepsResponse, RunStep as RunStepDto, ArtifactsResponse, ArtifactDto } from '@agentic-template/dto/src/run-engine/run-step.dto';

/**
 * Job data for the run orchestration queue
 */
export interface RunOrchestrationJobData {
  runId: string;
  tenantId: string;
}

/**
 * API service for the Run Engine.
 * Acts as a queue producer and query interface for the API Center.
 */
@Injectable()
export class RunEngineApiService {
  private readonly logger = new Logger(RunEngineApiService.name);

  constructor(
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    @InjectRepository(RunStep)
    private readonly runStepRepository: Repository<RunStep>,
    @InjectRepository(Artifact)
    private readonly artifactRepository: Repository<Artifact>,
    @InjectQueue(QueueNames.RUN_ORCHESTRATION)
    private readonly orchestrationQueue: Queue<RunOrchestrationJobData>,
    private readonly tenantClsService: TenantClsService,
  ) {}

  /**
   * Trigger a new workflow run by enqueueing to the orchestration queue.
   *
   * @param request The trigger run request
   * @returns The trigger response with run ID
   */
  async triggerRun(request: TriggerRunRequest): Promise<TriggerRunResponse> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    // Create run record
    const run = this.runRepository.create({
      tenantId,
      workflowName: request.workflowName,
      workflowVersion: request.workflowVersion || '1.0.0',
      triggerType: 'initial',
      triggerPayload: request.triggerPayload || {},
      status: 'queued',
    });

    const savedRun = await this.runRepository.save(run);
    this.logger.log(`Run created: ${savedRun.id} for workflow ${request.workflowName}`);

    // Enqueue for orchestration
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

    return {
      runId: savedRun.id,
      status: 'queued' as RunStatus,
      message: 'Run queued for execution',
    };
  }

  /**
   * Get run details by ID.
   *
   * @param runId The run ID
   * @returns The run response
   */
  async getRun(runId: string): Promise<RunResponse> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Get step counts by status
    const steps = await this.runStepRepository.find({
      where: { runId, tenantId },
    });

    const stepsSummary: StepsSummary = {
      total: steps.length,
      pending: steps.filter((s) => s.status === 'pending').length,
      running: steps.filter((s) => s.status === 'running').length,
      completed: steps.filter((s) => s.status === 'completed').length,
      skipped: steps.filter((s) => s.status === 'skipped').length,
      failed: steps.filter((s) => s.status === 'failed').length,
    };

    return {
      id: run.id,
      workflowName: run.workflowName,
      workflowVersion: run.workflowVersion,
      triggerType: run.triggerType,
      triggerPayload: run.triggerPayload,
      status: run.status as RunStatus,
      baseRunId: run.baseRunId,
      error: run.error
        ? {
            code: run.error.code,
            message: run.error.message,
            failedStepId: run.error.failedStepId,
            timestamp: new Date(run.error.timestamp),
          }
        : undefined,
      stepsSummary,
      startedAt: run.startedAt || undefined,
      completedAt: run.completedAt || undefined,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  /**
   * Get all steps for a run.
   *
   * @param runId The run ID
   * @param statusFilter Optional status filter
   * @returns The run steps response
   */
  async getRunSteps(runId: string, statusFilter?: StepStatusType): Promise<RunStepsResponse> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    // Verify run exists
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const where: { runId: string; tenantId: string; status?: StepStatusType } = {
      runId,
      tenantId,
    };

    if (statusFilter) {
      where.status = statusFilter;
    }

    const steps = await this.runStepRepository.find({
      where,
      order: { createdAt: 'ASC' },
    });

    const stepDtos: RunStepDto[] = steps.map((step) => ({
      id: step.id,
      stepId: step.stepId,
      skillId: step.skillId,
      status: step.status,
      inputHash: step.inputHash,
      attempt: step.attempt,
      outputArtifactIds: step.outputArtifactIds,
      error: step.error
        ? {
            code: step.error.code,
            message: step.error.message,
            attempt: step.error.attempt,
            timestamp: new Date(step.error.timestamp),
            details: step.error.details,
          }
        : undefined,
      cacheHit: step.cacheHit,
      startedAt: step.startedAt || undefined,
      endedAt: step.endedAt || undefined,
      durationMs: step.durationMs || undefined,
    }));

    return {
      runId,
      steps: stepDtos,
    };
  }

  /**
   * Get all artifacts produced by a run.
   *
   * @param runId The run ID
   * @param stepId Optional filter by step ID
   * @returns The artifacts response
   */
  async getRunArtifacts(runId: string, stepId?: string): Promise<ArtifactsResponse> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    // Verify run exists
    const run = await this.runRepository.findOne({
      where: { id: runId, tenantId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Get completed steps to find artifact IDs
    const steps = await this.runStepRepository.find({
      where: { runId, tenantId },
    });

    // Collect all artifact IDs
    const artifactIdsByStep = new Map<string, string[]>();
    for (const step of steps) {
      if (step.outputArtifactIds && step.outputArtifactIds.length > 0) {
        if (!stepId || step.stepId === stepId) {
          artifactIdsByStep.set(step.stepId, step.outputArtifactIds);
        }
      }
    }

    const allArtifactIds = Array.from(artifactIdsByStep.values()).flat();

    if (allArtifactIds.length === 0) {
      return { runId, artifacts: [] };
    }

    // Fetch artifacts
    const artifacts = await this.artifactRepository.find({
      where: { tenantId, runId },
    });

    // Map step IDs to artifacts
    const stepIdByArtifactId = new Map<string, string>();
    for (const [sId, artIds] of artifactIdsByStep) {
      for (const artId of artIds) {
        stepIdByArtifactId.set(artId, sId);
      }
    }

    const artifactDtos: ArtifactDto[] = artifacts.map((a) => ({
      id: a.id,
      stepId: stepIdByArtifactId.get(a.id),
      type: a.type,
      uri: a.uri,
      contentHash: a.contentHash,
      sizeBytes: a.sizeBytes,
      filename: a.filename,
      metadata: a.metadata,
      createdAt: a.createdAt,
    }));

    return {
      runId,
      artifacts: artifactDtos,
    };
  }
}
