import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from '@agentic-template/dao/src/entities/campaign.entity';
import { CampaignStatusService } from './campaign-status.service';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign])],
  providers: [CampaignStatusService],
  exports: [CampaignStatusService],
})
export class CampaignModule {}
