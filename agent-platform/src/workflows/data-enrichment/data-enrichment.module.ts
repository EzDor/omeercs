import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataEnrichmentWorkflow } from './data-enrichment.workflow';
import { DataLoaderService } from './services/data-loader.service';
import { DataTransformerService } from './services/data-transformer.service';
import { LlmEnrichmentService } from './services/llm-enrichment.service';
import { DataSaverService } from './services/data-saver.service';
import { PromptTemplateService } from '@agentic-template/common/src/llm/services/prompt-template.service';

@Module({
  imports: [ConfigModule],
  providers: [DataEnrichmentWorkflow, DataLoaderService, DataTransformerService, LlmEnrichmentService, DataSaverService, PromptTemplateService],
  exports: [DataEnrichmentWorkflow],
})
export class DataEnrichmentModule {}
