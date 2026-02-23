import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsModule } from '@agentic-template/common/src/tenant/tenant-cls.module';

import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { RunStep } from '@agentic-template/dao/src/entities/run-step.entity';
import { StepCache } from '@agentic-template/dao/src/entities/step-cache.entity';
import { Artifact } from '@agentic-template/dao/src/entities/artifact.entity';
import { InputHasherService } from './services/input-hasher.service';
import { DependencyGraphService } from './services/dependency-graph.service';
import { WorkflowRegistryService } from './services/workflow-registry.service';
import { RunEngineService } from './services/run-engine.service';
import { StepCacheService } from './services/step-cache.service';
import { CachedStepExecutorService } from './services/cached-step-executor.service';
import { LangGraphWorkflowBuilderService } from './services/langgraph-workflow-builder.service';
import { LangGraphRunProcessor } from './processors/langgraph-run.processor';
import { SkillsModule } from '../skills/skills.module';
import { WorkflowOrchestrationModule } from '../workflow-orchestration/workflow-orchestration.module';
import { CampaignModule } from '../campaign/campaign.module';

@Module({
  imports: [
    TenantClsModule,
    TypeOrmModule.forFeature([Run, RunStep, StepCache, Artifact]),
    BullModule.registerQueue({
      name: QueueNames.RUN_ORCHESTRATION,
    }),
    BullModule.registerQueue({
      name: QueueNames.RUN_STEPS,
    }),
    SkillsModule,
    WorkflowOrchestrationModule,
    CampaignModule,
  ],
  providers: [
    InputHasherService,
    DependencyGraphService,
    WorkflowRegistryService,
    RunEngineService,
    StepCacheService,
    CachedStepExecutorService,
    LangGraphWorkflowBuilderService,
    LangGraphRunProcessor,
  ],
  exports: [RunEngineService, WorkflowRegistryService, InputHasherService, DependencyGraphService, StepCacheService],
})
export class RunEngineModule {}
