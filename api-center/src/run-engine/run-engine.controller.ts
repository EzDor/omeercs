import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus, Logger, ParseUUIDPipe } from '@nestjs/common';
import { RunEngineApiService } from './services/run-engine-api.service';
import { TriggerRunRequest } from '@agentic-template/dto/src/run-engine/run.dto';
import type { TriggerRunResponse, RunResponse } from '@agentic-template/dto/src/run-engine/run.dto';

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
}
