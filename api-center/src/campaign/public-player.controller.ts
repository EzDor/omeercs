import { Controller, Get, Param, Header, Logger, NotFoundException, ParseUUIDPipe, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { Public } from '@agentic-template/common/src/auth/public.decorator';
import { Campaign } from '@agentic-template/dao/src/entities/campaign.entity';
import type { PublicCampaignResponse } from '@agentic-template/dto/src/campaign/campaign.dto';
import type { ThemeConfig } from '@agentic-template/dto/src/campaign/campaign-config.interface';

@Controller('play')
@Public()
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class PublicPlayerController {
  private readonly logger = new Logger(PublicPlayerController.name);

  private readonly allowedEmbedDomains: string;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    configService: ConfigService,
  ) {
    this.allowedEmbedDomains = configService.get<string>('ALLOWED_EMBED_DOMAINS', '*');
  }

  @Get(':campaignId')
  @Header('Cache-Control', 'public, max-age=300')
  async getPlayer(@Param('campaignId', ParseUUIDPipe) id: string): Promise<PublicCampaignResponse> {
    const campaign = await this.findLiveCampaign(id);
    return this.toPublicResponse(campaign);
  }

  @Get(':campaignId/embed')
  @Header('Cache-Control', 'public, max-age=300')
  async getEmbed(@Param('campaignId', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<PublicCampaignResponse> {
    const domains = this.allowedEmbedDomains;
    res.setHeader('Content-Security-Policy', `frame-ancestors ${domains}`);
    if (domains === '*') {
      res.setHeader('X-Frame-Options', 'ALLOWALL');
    }
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
        theme: campaign.config?.theme || ({} as ThemeConfig),
        game: campaign.config?.game || {},
      },
    };
  }
}
