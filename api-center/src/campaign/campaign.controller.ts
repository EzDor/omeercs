import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, HttpCode, HttpStatus, Logger, ParseUUIDPipe } from '@nestjs/common';
import { CampaignApiService } from './campaign-api.service';
import { CreateCampaignRequest, UpdateCampaignRequest, BulkCampaignRequest, CampaignRunsQuery } from '@agentic-template/dto/src/campaign/campaign.dto';
import { CampaignListQuery } from '@agentic-template/dto/src/campaign/campaign-list-query.dto';
import type { AuthRequestDto } from '@agentic-template/dto/src/auth/auth-request.dto';

@Controller('campaigns')
export class CampaignController {
  private readonly logger = new Logger(CampaignController.name);

  constructor(private readonly campaignService: CampaignApiService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCampaignRequest, @Request() req: AuthRequestDto) {
    const { tenantId, userId } = req.auth!;
    this.logger.log(`POST /campaigns - tenant: ${tenantId}, user: ${userId}`);
    return this.campaignService.create(tenantId, userId, dto);
  }

  @Get()
  async findAll(@Query() query: CampaignListQuery, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    this.logger.debug(`GET /campaigns - tenant: ${tenantId}`);
    return this.campaignService.findAll(tenantId, query);
  }

  @Get(':campaignId')
  async findOne(@Param('campaignId', ParseUUIDPipe) id: string, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    return this.campaignService.findOne(tenantId, id);
  }

  @Patch(':campaignId')
  async update(@Param('campaignId', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignRequest, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    this.logger.log(`PATCH /campaigns/${id} - tenant: ${tenantId}`);
    return this.campaignService.update(tenantId, id, dto);
  }

  @Delete(':campaignId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('campaignId', ParseUUIDPipe) id: string, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    this.logger.log(`DELETE /campaigns/${id} - tenant: ${tenantId}`);
    await this.campaignService.softDelete(tenantId, id);
  }

  @Post(':campaignId/duplicate')
  @HttpCode(HttpStatus.CREATED)
  async duplicate(@Param('campaignId', ParseUUIDPipe) id: string, @Body() body: { name?: string }, @Request() req: AuthRequestDto) {
    const { tenantId, userId } = req.auth!;
    this.logger.log(`POST /campaigns/${id}/duplicate - tenant: ${tenantId}`);
    return this.campaignService.duplicate(tenantId, userId, id, body.name);
  }

  @Post(':campaignId/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  async generate(@Param('campaignId', ParseUUIDPipe) id: string, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    this.logger.log(`POST /campaigns/${id}/generate - tenant: ${tenantId}`);
    return this.campaignService.generate(tenantId, id);
  }

  @Post(':campaignId/archive')
  async archive(@Param('campaignId', ParseUUIDPipe) id: string, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    this.logger.log(`POST /campaigns/${id}/archive - tenant: ${tenantId}`);
    return this.campaignService.archive(tenantId, id);
  }

  @Post(':campaignId/restore')
  async restore(@Param('campaignId', ParseUUIDPipe) id: string, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    this.logger.log(`POST /campaigns/${id}/restore - tenant: ${tenantId}`);
    return this.campaignService.restore(tenantId, id);
  }

  @Post('bulk-archive')
  async bulkArchive(@Body() dto: BulkCampaignRequest, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    this.logger.log(`POST /campaigns/bulk-archive - tenant: ${tenantId}, count: ${dto.campaignIds.length}`);
    return this.campaignService.bulkArchive(tenantId, dto.campaignIds);
  }

  @Post('bulk-delete')
  async bulkDelete(@Body() dto: BulkCampaignRequest, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    this.logger.log(`POST /campaigns/bulk-delete - tenant: ${tenantId}, count: ${dto.campaignIds.length}`);
    return this.campaignService.bulkDelete(tenantId, dto.campaignIds);
  }

  @Get(':campaignId/runs')
  async getCampaignRuns(@Param('campaignId', ParseUUIDPipe) id: string, @Query() query: CampaignRunsQuery, @Request() req: AuthRequestDto) {
    const { tenantId } = req.auth!;
    this.logger.debug(`GET /campaigns/${id}/runs - tenant: ${tenantId}`);
    return this.campaignService.getCampaignRuns(tenantId, id, query);
  }
}
