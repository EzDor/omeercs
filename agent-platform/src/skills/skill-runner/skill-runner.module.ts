import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProvidersModule } from '@agentic-template/common/src/providers/providers.module';
import { SkillRunnerService } from './skill-runner.service';
import { WorkspaceService } from './services/workspace.service';
import { SecretsService } from './services/secrets.service';
import { ExecutionContextService } from './services/execution-context.service';
import { SchemaValidatorService } from './services/schema-validator.service';
import { LlmGenerationService } from './services/llm-generation.service';
import { SkillCatalogService } from '../services/skill-catalog.service';
import { PromptRegistryModule } from '../../prompt-registry/prompt-registry.module';
import { TemplateSystemModule } from '../../template-system/template-system.module';
import { OpenCodeModule } from '../opencode/opencode.module';

@Module({
  imports: [ConfigModule, PromptRegistryModule, ProvidersModule, TemplateSystemModule, OpenCodeModule],
  providers: [SkillRunnerService, WorkspaceService, SecretsService, ExecutionContextService, SchemaValidatorService, LlmGenerationService, SkillCatalogService],
  exports: [SkillRunnerService, WorkspaceService, SecretsService, ExecutionContextService, SchemaValidatorService, LlmGenerationService],
})
export class SkillRunnerModule {}
