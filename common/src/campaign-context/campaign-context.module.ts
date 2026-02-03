import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Run } from '@agentic-template/dao/src/entities/run.entity';
import { Artifact } from '@agentic-template/dao/src/entities/artifact.entity';
import { RunStep } from '@agentic-template/dao/src/entities/run-step.entity';
import { ReferenceTypeRegistryService } from './reference-type-registry.service';
import { CampaignContextService } from './campaign-context.service';
import { ContextResolverService } from './context-resolver.service';

@Module({
  imports: [TypeOrmModule.forFeature([Run, Artifact, RunStep])],
  providers: [ReferenceTypeRegistryService, CampaignContextService, ContextResolverService],
  exports: [ReferenceTypeRegistryService, CampaignContextService, ContextResolverService],
})
export class CampaignContextModule {}
