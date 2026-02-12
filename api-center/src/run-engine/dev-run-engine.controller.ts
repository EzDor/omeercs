import { Controller, Get, Post, Body, Param, Query, Headers, HttpCode, HttpStatus, Logger, ParseUUIDPipe, BadRequestException } from '@nestjs/common';
import { Public } from '@agentic-template/common/src/auth/public.decorator';
import { TenantClsService } from '@agentic-template/common/src/tenant/tenant-cls.service';
import { RunEngineApiService } from './services/run-engine-api.service';
import { TriggerRunRequest } from '@agentic-template/dto/src/run-engine/run.dto';
import type { TriggerRunResponse, RunResponse } from '@agentic-template/dto/src/run-engine/run.dto';
import type { RunStepsResponse, CacheAnalysisResponse } from '@agentic-template/dto/src/run-engine/run-step.dto';
import { StepStatusType } from '@agentic-template/dao/src/entities/run-step.entity';
import * as fs from 'fs';

const DEV_TENANT_ID = 'dev-tenant';
const DEV_USER_ID = 'dev-user';

@Controller('dev/runs')
export class DevRunEngineController {
  private readonly logger = new Logger(DevRunEngineController.name);

  constructor(
    private readonly runEngineApiService: RunEngineApiService,
    private readonly tenantClsService: TenantClsService,
  ) {
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn('DevRunEngineController should not be used in production!');
    }
  }

  private getTenantId(headerTenantId?: string): string {
    return headerTenantId || DEV_TENANT_ID;
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerRun(@Headers('x-tenant-id') headerTenantId: string, @Body() request: TriggerRunRequest): Promise<TriggerRunResponse> {
    const tenantId = this.getTenantId(headerTenantId);
    const logFile = '/tmp/dev-trigger.log';
    const log = (msg: string) => {
      const ts = new Date().toISOString();
      fs.appendFileSync(logFile, `[${ts}] ${msg}\n`);
    };

    log(`POST /dev/runs - workflow: ${request.workflowName}, tenant: ${tenantId}`);

    try {
      return await this.tenantClsService.runWithTenant(tenantId, DEV_USER_ID, async () => {
        log('Inside runWithTenant, calling triggerRun...');
        const result = await this.runEngineApiService.triggerRun(request);
        log(`triggerRun completed: ${JSON.stringify(result)}`);
        return result;
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : 'N/A';
      log(`triggerRun FAILED: ${errorMsg}\n${errorStack}`);
      throw error;
    }
  }

  @Public()
  @Get(':runId')
  async getRun(@Headers('x-tenant-id') headerTenantId: string, @Param('runId', ParseUUIDPipe) runId: string): Promise<RunResponse> {
    const tenantId = this.getTenantId(headerTenantId);
    this.logger.debug(`[DEV] GET /dev/runs/${runId} - tenant: ${tenantId}`);

    return this.tenantClsService.runWithTenant(tenantId, DEV_USER_ID, async () => {
      return this.runEngineApiService.getRun(runId);
    });
  }

  @Public()
  @Get(':runId/steps')
  async getRunSteps(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query('status') status?: string,
  ): Promise<RunStepsResponse> {
    const tenantId = this.getTenantId(headerTenantId);
    this.logger.debug(`[DEV] GET /dev/runs/${runId}/steps - tenant: ${tenantId}, status: ${status || 'all'}`);

    const validStatuses: StepStatusType[] = ['pending', 'running', 'skipped', 'completed', 'failed'];
    let statusFilter: StepStatusType | undefined;

    if (status) {
      if (!validStatuses.includes(status as StepStatusType)) {
        throw new BadRequestException(`Invalid status: ${status}. Valid values: ${validStatuses.join(', ')}`);
      }
      statusFilter = status as StepStatusType;
    }

    return this.tenantClsService.runWithTenant(tenantId, DEV_USER_ID, async () => {
      return this.runEngineApiService.getRunSteps(runId, statusFilter);
    });
  }

  @Public()
  @Get(':runId/artifacts')
  async getRunArtifacts(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query('stepId') stepId?: string,
  ) {
    const tenantId = this.getTenantId(headerTenantId);
    this.logger.debug(`[DEV] GET /dev/runs/${runId}/artifacts - tenant: ${tenantId}, stepId: ${stepId || 'all'}`);

    return this.tenantClsService.runWithTenant(tenantId, DEV_USER_ID, async () => {
      return this.runEngineApiService.getRunArtifacts(runId, stepId);
    });
  }

  @Public()
  @Get(':runId/cache-analysis')
  async getCacheAnalysis(@Headers('x-tenant-id') headerTenantId: string, @Param('runId', ParseUUIDPipe) runId: string): Promise<CacheAnalysisResponse> {
    const tenantId = this.getTenantId(headerTenantId);
    this.logger.debug(`[DEV] GET /dev/runs/${runId}/cache-analysis - tenant: ${tenantId}`);

    return this.tenantClsService.runWithTenant(tenantId, DEV_USER_ID, async () => {
      return this.runEngineApiService.getCacheAnalysis(runId);
    });
  }
}
