import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Ajv, { type ValidateFunction } from 'ajv';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';

import { Run } from '@agentic-template/dao/src/entities/run.entity';

import type { TriggerRunRequest, TriggerRunResponse, RunResponse, RunStatus } from '@agentic-template/dto/src/run-engine/run.dto';

export interface RunOrchestrationJobData {
  runId: string;
  tenantId: string;
}

const PAYLOAD_SCHEMAS: Record<string, object> = {
  'campaign.build': {
    type: 'object',
    required: ['brief'],
    properties: {
      brief: { type: 'string' },
      brand_assets: { type: 'object' },
      constraints: { type: 'object' },
      tone: { type: 'string' },
      campaign_id: { type: 'string' },
      campaign_name: { type: 'string' },
    },
    additionalProperties: true,
  },
  'campaign.build.minimal': {
    type: 'object',
    required: ['template_id'],
    properties: {
      template_id: { type: 'string' },
      theme: { type: 'string' },
      difficulty: { type: 'string' },
      color_scheme: { type: 'object' },
      copy: { type: 'object' },
      audio: { type: 'object' },
      campaign_id: { type: 'string' },
      campaign_name: { type: 'string' },
    },
    additionalProperties: true,
  },
  'campaign.update_intro': {
    type: 'object',
    required: ['campaign_id'],
    properties: {
      campaign_id: { type: 'string' },
      brand_assets: { type: 'object' },
      intro_overrides: { type: 'object' },
    },
    additionalProperties: true,
  },
  'campaign.update_audio': {
    type: 'object',
    required: ['campaign_id'],
    properties: {
      campaign_id: { type: 'string' },
      audio_overrides: { type: 'object' },
    },
    additionalProperties: true,
  },
  'campaign.update_outcome': {
    type: 'object',
    required: ['campaign_id'],
    properties: {
      campaign_id: { type: 'string' },
      brand_assets: { type: 'object' },
      outcome_overrides: { type: 'object' },
    },
    additionalProperties: true,
  },
  'campaign.update_game_config': {
    type: 'object',
    required: ['campaign_id'],
    properties: {
      campaign_id: { type: 'string' },
      game_overrides: { type: 'object' },
    },
    additionalProperties: true,
  },
  'campaign.replace_3d_asset': {
    type: 'object',
    required: ['campaign_id', 'asset_prompt', 'asset_slot'],
    properties: {
      campaign_id: { type: 'string' },
      asset_prompt: { type: 'string' },
      asset_slot: { type: 'string' },
      asset_constraints: { type: 'object' },
      optimization_params: { type: 'object' },
    },
    additionalProperties: true,
  },
};

@Injectable()
export class RunEngineApiService {
  private readonly logger = new Logger(RunEngineApiService.name);
  private readonly payloadValidators: Map<string, ValidateFunction>;

  constructor(
    @InjectRepository(Run)
    private readonly runRepository: Repository<Run>,
    @InjectQueue(QueueNames.RUN_ORCHESTRATION)
    private readonly orchestrationQueue: Queue<RunOrchestrationJobData>,
    private readonly tenantClsService: TenantClsService,
  ) {
    const ajv = new Ajv({ allErrors: true });
    this.payloadValidators = new Map();
    for (const [workflowName, schema] of Object.entries(PAYLOAD_SCHEMAS)) {
      this.payloadValidators.set(workflowName, ajv.compile(schema));
    }
  }

  private validatePayload(workflowName: string, payload: Record<string, unknown>): void {
    const validator = this.payloadValidators.get(workflowName);
    if (!validator) return;

    if (!validator(payload)) {
      const errors = validator.errors?.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
      throw new BadRequestException(`Invalid triggerPayload for ${workflowName}: ${errors}`);
    }
  }

  async triggerRun(request: TriggerRunRequest): Promise<TriggerRunResponse> {
    const tenantId = this.tenantClsService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    this.validatePayload(request.workflowName, request.triggerPayload || {});

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
