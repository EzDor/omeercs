import { Injectable, Logger, NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign, CampaignStatusType } from '@agentic-template/dao/src/entities/campaign.entity';
import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { RunEngineApiService } from '../run-engine/services/run-engine-api.service';
import type { CreateCampaignRequest, UpdateCampaignRequest, CampaignResponse, GenerateResponse, BulkOperationResponse, CampaignListResponse } from '@agentic-template/dto/src/campaign/campaign.dto';
import type { CampaignListQuery } from '@agentic-template/dto/src/campaign/campaign-list-query.dto';
import type { CampaignRunsQuery } from '@agentic-template/dto/src/campaign/campaign.dto';

@Injectable()
export class CampaignApiService {
  private readonly logger = new Logger(CampaignApiService.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(Run)
    private readonly runRepo: Repository<Run>,
    private readonly runEngineApiService: RunEngineApiService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreateCampaignRequest): Promise<CampaignResponse> {
    const campaign = this.campaignRepo.create({
      tenantId,
      userId,
      name: dto.name,
      templateId: dto.templateId,
      config: dto.config,
      status: 'draft' as CampaignStatusType,
      version: 1,
    });

    const saved = await this.campaignRepo.save(campaign);
    this.logger.log(`Campaign created: ${saved.id} for tenant ${tenantId}`);
    return this.toResponse(saved);
  }

  async findAll(tenantId: string, query: CampaignListQuery): Promise<CampaignListResponse> {
    const qb = this.campaignRepo.createQueryBuilder('campaign').where('campaign.tenantId = :tenantId', { tenantId }).andWhere('campaign.deletedAt IS NULL');

    if (query.status) {
      qb.andWhere('campaign.status = :status', { status: query.status });
    }
    if (query.templateId) {
      qb.andWhere('campaign.templateId = :templateId', { templateId: query.templateId });
    }
    if (query.search) {
      qb.andWhere('campaign.name ILIKE :search', { search: `%${query.search}%` });
    }

    const sortBy = query.sortBy || 'updatedAt';
    const sortOrder = (query.sortOrder || 'desc').toUpperCase() as 'ASC' | 'DESC';
    const columnMap: Record<string, string> = { name: 'campaign.name', createdAt: 'campaign.createdAt', updatedAt: 'campaign.updatedAt' };
    qb.orderBy(columnMap[sortBy] || 'campaign.updatedAt', sortOrder);

    const limit = query.limit || 20;
    const offset = query.offset || 0;
    qb.take(limit).skip(offset);

    const [campaigns, total] = await qb.getManyAndCount();
    return { campaigns: campaigns.map((c) => this.toResponse(c)), total, limit, offset };
  }

  async findOne(tenantId: string, id: string): Promise<CampaignResponse> {
    const campaign = await this.findCampaignOrFail(tenantId, id);
    return this.toResponse(campaign);
  }

  async update(tenantId: string, id: string, dto: UpdateCampaignRequest): Promise<CampaignResponse> {
    const campaign = await this.findCampaignOrFail(tenantId, id);

    if (campaign.status !== 'draft' && campaign.status !== 'failed') {
      throw new UnprocessableEntityException(`Campaign cannot be updated in '${campaign.status}' state`);
    }

    if (dto.expectedVersion !== undefined && dto.expectedVersion !== campaign.version) {
      throw new ConflictException('Campaign was modified by another session. Please reload and try again.');
    }

    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.config !== undefined) campaign.config = { ...campaign.config, ...dto.config } as any;
    campaign.version += 1;

    const saved = await this.campaignRepo.save(campaign);
    this.logger.log(`Campaign updated: ${saved.id}, version: ${saved.version}`);
    return this.toResponse(saved);
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    const campaign = await this.findCampaignOrFail(tenantId, id);

    if (campaign.status !== 'draft' && campaign.status !== 'failed' && campaign.status !== 'archived') {
      throw new UnprocessableEntityException(`Campaign cannot be deleted in '${campaign.status}' state. Archive it first.`);
    }

    await this.campaignRepo.softRemove(campaign);
    this.logger.log(`Campaign soft-deleted: ${id}`);
  }

  async duplicate(tenantId: string, userId: string, id: string, newName?: string): Promise<CampaignResponse> {
    const source = await this.findCampaignOrFail(tenantId, id);

    const copy = this.campaignRepo.create({
      tenantId,
      userId,
      name: newName || `${source.name} (Copy)`,
      templateId: source.templateId,
      config: source.config ? JSON.parse(JSON.stringify(source.config)) : undefined,
      status: 'draft' as CampaignStatusType,
      version: 1,
    });

    const saved = await this.campaignRepo.save(copy);
    this.logger.log(`Campaign duplicated: ${source.id} → ${saved.id}`);
    return this.toResponse(saved);
  }

  async generate(tenantId: string, id: string): Promise<GenerateResponse> {
    const campaign = await this.findCampaignOrFail(tenantId, id);

    if (campaign.status === 'generating') {
      throw new UnprocessableEntityException('Campaign is already generating');
    }
    if (campaign.status !== 'draft' && campaign.status !== 'failed') {
      throw new UnprocessableEntityException(`Campaign cannot be generated in '${campaign.status}' state`);
    }
    if (!campaign.config) {
      throw new UnprocessableEntityException('Campaign config is incomplete');
    }

    campaign.status = 'generating';
    campaign.version += 1;

    const workflowName = `game-${campaign.templateId}`;
    const triggerResult = await this.runEngineApiService.triggerRun({
      workflowName,
      triggerPayload: { campaignId: campaign.id, config: campaign.config },
    });

    campaign.latestRunId = triggerResult.runId;
    await this.campaignRepo.save(campaign);

    this.logger.log(`Campaign generation triggered: ${campaign.id}, runId: ${triggerResult.runId}`);
    return { campaignId: campaign.id, runId: triggerResult.runId, status: 'generating' };
  }

  async archive(tenantId: string, id: string): Promise<CampaignResponse> {
    const campaign = await this.findCampaignOrFail(tenantId, id);
    if (campaign.status !== 'live') {
      throw new UnprocessableEntityException(`Only live campaigns can be archived. Current status: '${campaign.status}'`);
    }
    campaign.status = 'archived';
    campaign.version += 1;
    const saved = await this.campaignRepo.save(campaign);
    this.logger.log(`Campaign archived: ${id}`);
    return this.toResponse(saved);
  }

  async restore(tenantId: string, id: string): Promise<CampaignResponse> {
    const campaign = await this.findCampaignOrFail(tenantId, id);
    if (campaign.status !== 'archived') {
      throw new UnprocessableEntityException(`Only archived campaigns can be restored. Current status: '${campaign.status}'`);
    }
    campaign.status = 'live';
    campaign.version += 1;
    const saved = await this.campaignRepo.save(campaign);
    this.logger.log(`Campaign restored: ${id}`);
    return this.toResponse(saved);
  }

  async bulkArchive(tenantId: string, campaignIds: string[]): Promise<BulkOperationResponse> {
    let archived = 0;
    let skipped = 0;
    const errors: { id: string; reason: string }[] = [];

    for (const id of campaignIds) {
      try {
        await this.archive(tenantId, id);
        archived++;
      } catch (error) {
        if (error instanceof NotFoundException || error instanceof UnprocessableEntityException) {
          skipped++;
          errors.push({ id, reason: (error as Error).message });
        } else {
          throw error;
        }
      }
    }

    return { archived, skipped, errors };
  }

  async bulkDelete(tenantId: string, campaignIds: string[]): Promise<BulkOperationResponse> {
    let deleted = 0;
    let skipped = 0;
    const errors: { id: string; reason: string }[] = [];

    for (const id of campaignIds) {
      try {
        await this.softDelete(tenantId, id);
        deleted++;
      } catch (error) {
        if (error instanceof NotFoundException || error instanceof UnprocessableEntityException) {
          skipped++;
          errors.push({ id, reason: (error as Error).message });
        } else {
          throw error;
        }
      }
    }

    return { deleted, skipped, errors };
  }

  async getCampaignRuns(tenantId: string, campaignId: string, query: CampaignRunsQuery): Promise<{ runs: any[]; total: number; limit: number; offset: number }> {
    await this.findCampaignOrFail(tenantId, campaignId);

    const qb = this.runRepo
      .createQueryBuilder('run')
      .where('run.tenantId = :tenantId', { tenantId })
      .andWhere("run.context->>'campaignId' = :campaignId", { campaignId });

    if (query.status) {
      qb.andWhere('run.status = :status', { status: query.status });
    }

    qb.orderBy('run.createdAt', 'DESC');

    const limit = query.limit || 20;
    const offset = query.offset || 0;
    qb.take(limit).skip(offset);

    const [runs, total] = await qb.getManyAndCount();
    return { runs, total, limit, offset };
  }

  private async findCampaignOrFail(tenantId: string, id: string): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id, tenantId } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }
    return campaign;
  }

  private toResponse(campaign: Campaign): CampaignResponse {
    return {
      id: campaign.id,
      tenantId: campaign.tenantId,
      userId: campaign.userId,
      name: campaign.name,
      templateId: campaign.templateId,
      status: campaign.status,
      config: campaign.config || null,
      bundleUrl: campaign.bundleUrl || null,
      thumbnailUrl: campaign.thumbnailUrl || null,
      latestRunId: campaign.latestRunId || null,
      version: campaign.version,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}
