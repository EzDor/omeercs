import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SkillRunnerService } from './skill-runner.service';
import { WorkspaceService } from './services/workspace.service';
import { SecretsService } from './services/secrets.service';
import { ExecutionContextService } from './services/execution-context.service';
import { SchemaValidatorService } from './services/schema-validator.service';
import { LlmGenerationService } from './services/llm-generation.service';
import { SkillCatalogService } from '../services/skill-catalog.service';
import { PromptRegistryModule } from '../../prompt-registry/prompt-registry.module';

/**
 * Module for skill execution services.
 * Provides the SkillRunnerService and supporting services for skill lifecycle management.
 *
 * Note: TenantClsService is available globally via TenantClsModule (@Global).
 */
@Module({
  imports: [ConfigModule, PromptRegistryModule],
  providers: [SkillRunnerService, WorkspaceService, SecretsService, ExecutionContextService, SchemaValidatorService, LlmGenerationService, SkillCatalogService],
  exports: [SkillRunnerService, WorkspaceService, SecretsService, ExecutionContextService, SchemaValidatorService, LlmGenerationService],
})
export class SkillRunnerModule {}
