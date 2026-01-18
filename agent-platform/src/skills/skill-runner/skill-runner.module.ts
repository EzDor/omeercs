import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SkillRunnerService } from './skill-runner.service';
import { WorkspaceService } from './services/workspace.service';
import { SecretsService } from './services/secrets.service';
import { ExecutionContextService } from './services/execution-context.service';
import { SchemaValidatorService } from './services/schema-validator.service';
import { SkillCatalogService } from '../services/skill-catalog.service';

/**
 * Module for skill execution services.
 * Provides the SkillRunnerService and supporting services for skill lifecycle management.
 *
 * Note: TenantClsService is available globally via TenantClsModule (@Global).
 */
@Module({
  imports: [ConfigModule],
  providers: [SkillRunnerService, WorkspaceService, SecretsService, ExecutionContextService, SchemaValidatorService, SkillCatalogService],
  exports: [SkillRunnerService, WorkspaceService, SecretsService, ExecutionContextService, SchemaValidatorService],
})
export class SkillRunnerModule {}
