import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SkillCatalogService } from './services/skill-catalog.service';
import { SkillRunnerModule } from './skill-runner/skill-runner.module';

@Module({
  imports: [ConfigModule, forwardRef(() => SkillRunnerModule)],
  providers: [SkillCatalogService],
  exports: [SkillCatalogService, SkillRunnerModule],
})
export class SkillsModule {}
