import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from '@agentic-template/dao/src/entities/campaign.entity';

export interface CampaignStatusUpdate {
  status: 'live' | 'failed';
  bundleUrl?: string;
  latestRunId: string;
}

@Injectable()
export class CampaignStatusService {
  private readonly logger = new Logger(CampaignStatusService.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
  ) {}

  async updateStatusFromRun(campaignId: string, update: CampaignStatusUpdate): Promise<void> {
    if (!campaignId) return;

    const campaign = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!campaign) {
      this.logger.warn(`Campaign ${campaignId} not found for status update`);
      return;
    }

    campaign.status = update.status;
    if (update.bundleUrl) {
      campaign.bundleUrl = update.bundleUrl;
    }
    campaign.latestRunId = update.latestRunId;
    campaign.version += 1;

    await this.campaignRepo.save(campaign);
    this.logger.log(`Campaign ${campaignId} status updated to ${update.status}`);
  }
}
