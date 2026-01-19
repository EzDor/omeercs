import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus, Logger, ParseUUIDPipe } from '@nestjs/common';
import { RunEngineApiService } from './services/run-engine-api.service';
import { TriggerRunRequest, TriggerRunResponse, RunResponse } from '@agentic-template/dto/src/run-engine/run.dto';
import { RunStepsResponse } from '@agentic-template/dto/src/run-engine/run-step.dto';
import { StepStatusType } from '@agentic-template/dao/src/entities/run-step.entity';

/**
 * Controller for Run Engine API endpoints.
 * Handles workflow run operations per OpenAPI spec.
 */
@Controller('runs')
export class RunEngineController {
  private readonly logger = new Logger(RunEngineController.name);

  constructor(private readonly runEngineApiService: RunEngineApiService) {}

  /**
   * POST /runs - Trigger a new workflow run
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerRun(@Body() request: TriggerRunRequest): Promise<TriggerRunResponse> {
    this.logger.debug(`POST /runs - workflow: ${request.workflowName}`);
    return this.runEngineApiService.triggerRun(request);
  }

  /**
   * GET /runs/:runId - Get run status and details
   */
  @Get(':runId')
  async getRun(@Param('runId', ParseUUIDPipe) runId: string): Promise<RunResponse> {
    this.logger.debug(`GET /runs/${runId}`);
    return this.runEngineApiService.getRun(runId);
  }

  /**
   * GET /runs/:runId/steps - Get all steps for a run
   */
  @Get(':runId/steps')
  async getRunSteps(@Param('runId', ParseUUIDPipe) runId: string, @Query('status') status?: string): Promise<RunStepsResponse> {
    this.logger.debug(`GET /runs/${runId}/steps - status: ${status || 'all'}`);

    // Validate status if provided
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

  /**
   * GET /runs/:runId/artifacts - Get all artifacts produced by a run
   */
  @Get(':runId/artifacts')
  async getRunArtifacts(@Param('runId', ParseUUIDPipe) runId: string, @Query('stepId') stepId?: string) {
    this.logger.debug(`GET /runs/${runId}/artifacts - stepId: ${stepId || 'all'}`);
    return this.runEngineApiService.getRunArtifacts(runId, stepId);
  }
}
