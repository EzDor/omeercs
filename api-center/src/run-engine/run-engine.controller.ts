import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus, Logger, ParseUUIDPipe } from '@nestjs/common';
import { RunEngineApiService } from './services/run-engine-api.service';
import { TriggerRunRequest } from '@agentic-template/dto/src/run-engine/run.dto';
import type { TriggerRunResponse, RunResponse } from '@agentic-template/dto/src/run-engine/run.dto';
import type { RunStepsResponse, CacheAnalysisResponse } from '@agentic-template/dto/src/run-engine/run-step.dto';
import { StepStatusType } from '@agentic-template/dao/src/entities/run-step.entity';

@Controller('runs')
export class RunEngineController {
  private readonly logger = new Logger(RunEngineController.name);

  constructor(private readonly runEngineApiService: RunEngineApiService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerRun(@Body() request: TriggerRunRequest): Promise<TriggerRunResponse> {
    this.logger.log(`POST /runs - workflow: ${request.workflowName}`);
    return this.runEngineApiService.triggerRun(request);
  }

  @Get(':runId')
  async getRun(@Param('runId', ParseUUIDPipe) runId: string): Promise<RunResponse> {
    this.logger.debug(`GET /runs/${runId}`);
    return this.runEngineApiService.getRun(runId);
  }

  @Get(':runId/steps')
  async getRunSteps(@Param('runId', ParseUUIDPipe) runId: string, @Query('status') status?: string): Promise<RunStepsResponse> {
    this.logger.debug(`GET /runs/${runId}/steps - status: ${status || 'all'}`);

    const validStatuses: StepStatusType[] = ['pending', 'running', 'skipped', 'completed', 'failed'];
    let statusFilter: StepStatusType | undefined;

    if (status) {
      if (!validStatuses.includes(status as StepStatusType)) {
        throw new Error(`Invalid status: ${status}. Valid values: ${validStatuses.join(', ')}`);
      }
      statusFilter = status as StepStatusType;
    }

    return this.runEngineApiService.getRunSteps(runId, statusFilter);
  }

  @Get(':runId/artifacts')
  async getRunArtifacts(@Param('runId', ParseUUIDPipe) runId: string, @Query('stepId') stepId?: string) {
    this.logger.debug(`GET /runs/${runId}/artifacts - stepId: ${stepId || 'all'}`);
    return this.runEngineApiService.getRunArtifacts(runId, stepId);
  }

  @Get(':runId/cache-analysis')
  async getCacheAnalysis(@Param('runId', ParseUUIDPipe) runId: string): Promise<CacheAnalysisResponse> {
    this.logger.debug(`GET /runs/${runId}/cache-analysis`);
    return this.runEngineApiService.getCacheAnalysis(runId);
  }
}
