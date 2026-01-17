import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SkillCatalogService } from './services/skill-catalog.service';

@Module({
  imports: [ConfigModule],
  providers: [SkillCatalogService],
  exports: [SkillCatalogService],
})
export class SkillsModule {}
