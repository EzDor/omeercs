import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PromptRegistryModule } from '../prompt-registry/prompt-registry.module';
import { SkillRunnerModule } from '../skills/skill-runner/skill-runner.module';
import { IntelligenceController } from './intelligence.controller';
import { IntelligencePlanService } from './services/intelligence-plan.service';
import { CopyGenerationService } from './services/copy-generation.service';
import { ThemeBriefService } from './services/theme-brief.service';
import { ThemeImageService } from './services/theme-image.service';

@Module({
  imports: [ConfigModule, PromptRegistryModule, SkillRunnerModule],
  controllers: [IntelligenceController],
  providers: [IntelligencePlanService, CopyGenerationService, ThemeBriefService, ThemeImageService],
})
export class IntelligenceModule {}
