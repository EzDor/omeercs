import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProvidersModule } from '@agentic-template/common/src/providers';
import { SkillCatalogService } from './services/skill-catalog.service';
import { SkillRunnerModule } from './skill-runner/skill-runner.module';

@Module({
  imports: [ConfigModule, ProvidersModule, forwardRef(() => SkillRunnerModule)],
  providers: [SkillCatalogService],
  exports: [SkillCatalogService, SkillRunnerModule],
})
export class SkillsModule {}
