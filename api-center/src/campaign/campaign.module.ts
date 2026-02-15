import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { TenantClsModule } from '@agentic-template/common/src/tenant/tenant-cls.module';
import { Campaign } from '@agentic-template/dao/src/entities/campaign.entity';
import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { RunEngineModule } from '../run-engine/run-engine.module';
import { CampaignApiService } from './campaign-api.service';
import { CampaignController } from './campaign.controller';
import { PublicPlayerController } from './public-player.controller';

@Module({
  imports: [ConfigModule, TenantClsModule, TypeOrmModule.forFeature([Campaign, Run]), RunEngineModule],
  controllers: [CampaignController, PublicPlayerController],
  providers: [CampaignApiService],
})
export class CampaignModule {}
