import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantClsModule } from '@agentic-template/common/src/tenant/tenant-cls.module';
import { AiGeneration } from '@agentic-template/dao/src/entities/ai-generation.entity';
import { Campaign } from '@agentic-template/dao/src/entities/campaign.entity';
import { CampaignModule } from '../campaign/campaign.module';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceApiService } from './intelligence-api.service';

@Module({
  imports: [ConfigModule, TenantClsModule, TypeOrmModule.forFeature([AiGeneration, Campaign]), CampaignModule],
  controllers: [IntelligenceController],
  providers: [IntelligenceApiService],
})
export class IntelligenceModule {}
