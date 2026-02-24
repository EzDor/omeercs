import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsModule } from '@agentic-template/common/src/tenant/tenant-cls.module';
import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { SkillsModule } from '../../skills/skills.module';
import { WorkflowOrchestrationModule } from '../../workflow-orchestration/workflow-orchestration.module';
import { CampaignModule } from '../../campaign/campaign.module';
import { SkillNodeService } from './services/skill-node.service';
import { CampaignBuildWorkflow } from './campaign-build.workflow';
import { CampaignBuildMinimalWorkflow } from './campaign-build-minimal.workflow';
import { CampaignUpdateIntroWorkflow } from './campaign-update-intro.workflow';
import { CampaignUpdateAudioWorkflow } from './campaign-update-audio.workflow';
import { CampaignUpdateOutcomeWorkflow } from './campaign-update-outcome.workflow';
import { CampaignUpdateGameConfigWorkflow } from './campaign-update-game-config.workflow';
import { CampaignReplace3dAssetWorkflow } from './campaign-replace-3d-asset.workflow';
import { CampaignRunProcessor } from './processors/campaign-run.processor';

@Module({
  imports: [
    TenantClsModule,
    TypeOrmModule.forFeature([Run]),
    BullModule.registerQueue({ name: QueueNames.RUN_ORCHESTRATION }),
    SkillsModule,
    WorkflowOrchestrationModule,
    CampaignModule,
  ],
  providers: [
    SkillNodeService,
    CampaignBuildWorkflow,
    CampaignBuildMinimalWorkflow,
    CampaignUpdateIntroWorkflow,
    CampaignUpdateAudioWorkflow,
    CampaignUpdateOutcomeWorkflow,
    CampaignUpdateGameConfigWorkflow,
    CampaignReplace3dAssetWorkflow,
    CampaignRunProcessor,
  ],
  exports: [
    CampaignBuildWorkflow,
    CampaignBuildMinimalWorkflow,
    CampaignUpdateIntroWorkflow,
    CampaignUpdateAudioWorkflow,
    CampaignUpdateOutcomeWorkflow,
    CampaignUpdateGameConfigWorkflow,
    CampaignReplace3dAssetWorkflow,
  ],
})
export class CampaignWorkflowsModule {}
