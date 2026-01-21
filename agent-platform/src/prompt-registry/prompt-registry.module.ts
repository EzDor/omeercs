import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PromptRegistryService } from './services/prompt-registry.service';
import { TemplateLoaderService } from './services/template-loader.service';
import { TemplateRendererService } from './services/template-renderer.service';

@Module({
  imports: [ConfigModule],
  providers: [PromptRegistryService, TemplateLoaderService, TemplateRendererService],
  exports: [PromptRegistryService],
})
export class PromptRegistryModule {}
