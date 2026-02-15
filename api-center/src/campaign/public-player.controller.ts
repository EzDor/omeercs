import { Controller, Get, Param, Header, Logger, NotFoundException, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '@agentic-template/common/src/auth/public.decorator';
import { Campaign } from '@agentic-template/dao/src/entities/campaign.entity';
import type { PublicCampaignResponse } from '@agentic-template/dto/src/campaign/campaign.dto';

@Controller('play')
@Public()
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class PublicPlayerController {
  private readonly logger = new Logger(PublicPlayerController.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
  ) {}

  @Get(':campaignId')
  @Header('Cache-Control', 'public, max-age=300')
  async getPlayer(@Param('campaignId', ParseUUIDPipe) id: string): Promise<PublicCampaignResponse> {
    const campaign = await this.findLiveCampaign(id);
    return this.toPublicResponse(campaign);
  }

  @Get(':campaignId/embed')
  @Header('Cache-Control', 'public, max-age=300')
  @Header('X-Frame-Options', 'ALLOWALL')
  @Header('Content-Security-Policy', 'frame-ancestors *')
  async getEmbed(@Param('campaignId', ParseUUIDPipe) id: string): Promise<PublicCampaignResponse> {
    const campaign = await this.findLiveCampaign(id);
    return this.toPublicResponse(campaign);
  }

  private async findLiveCampaign(id: string): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({
      where: { id, status: 'live' },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  private toPublicResponse(campaign: Campaign): PublicCampaignResponse {
    return {
      campaignId: campaign.id,
      name: campaign.name,
      templateId: campaign.templateId,
      bundleUrl: campaign.bundleUrl || '',
      config: {
        theme: campaign.config?.theme || ({} as any),
        game: campaign.config?.game || {},
      },
    };
  }
}
