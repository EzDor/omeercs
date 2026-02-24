import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';

import { Run } from '@agentic-template/dao/src/entities/run.entity';

import type { TriggerRunRequest, TriggerRunResponse, RunResponse, RunStatus } from '@agentic-template/dto/src/run-engine/run.dto';

export interface RunOrchestrationJobData {
  runId: string;
  tenantId: string;
}

@Injectable()
export class RunEngineApiService {
  private readonly logger = new Logger(RunEngineApiService.name);

  constructor(
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    @InjectQueue(QueueNames.RUN_ORCHESTRATION)
    private readonly orchestrationQueue: Queue<RunOrchestrationJobData>,
    private readonly tenantClsService: TenantClsService,
  ) {}

  async triggerRun(request: TriggerRunRequest): Promise<TriggerRunResponse> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

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
      startedAt: run.startedAt || undefined,
      completedAt: run.completedAt || undefined,
      durationMs: run.durationMs || undefined,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }
}
