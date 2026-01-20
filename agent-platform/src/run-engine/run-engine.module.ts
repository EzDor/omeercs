import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { QueueNames } from '@agentic-template/common/src/queues/queue-names';
import { TenantClsModule } from '@agentic-template/common/src/tenant/tenant-cls.module';

// Entities
import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { RunStep } from '@agentic-template/dao/src/entities/run-step.entity';
import { StepCache } from '@agentic-template/dao/src/entities/step-cache.entity';
import { Artifact } from '@agentic-template/dao/src/entities/artifact.entity';

// Core services
import { InputHasherService } from './services/input-hasher.service';
import { DependencyGraphService } from './services/dependency-graph.service';
import { WorkflowRegistryService } from './services/workflow-registry.service';
import { RunEngineService } from './services/run-engine.service';
import { StepCacheService } from './services/step-cache.service';

// Processors
import { RunOrchestratorProcessor } from './processors/run-orchestrator.processor';

// Skill runner integration
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [
    ConfigModule,
    TenantClsModule,
    TypeOrmModule.forFeature([Run, RunStep, StepCache, Artifact]),
    BullModule.registerQueue({
      name: QueueNames.RUN_ORCHESTRATION,
    }),
    BullModule.registerQueue({
      name: QueueNames.RUN_STEPS,
    }),
    SkillsModule,
  ],
  providers: [
    // Core services
    InputHasherService,
    DependencyGraphService,
    WorkflowRegistryService,
    RunEngineService,
    StepCacheService,

    // Processors
    RunOrchestratorProcessor,
  ],
  exports: [RunEngineService, WorkflowRegistryService, InputHasherService, DependencyGraphService, StepCacheService],
})
export class RunEngineModule {}
