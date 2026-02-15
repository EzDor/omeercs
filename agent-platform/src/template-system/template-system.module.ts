import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TemplateManifestLoaderService } from './services/template-manifest-loader.service';
import { TemplateConfigValidatorService } from './services/template-config-validator.service';

@Module({
  imports: [ConfigModule],
  providers: [TemplateManifestLoaderService, TemplateConfigValidatorService],
  exports: [TemplateManifestLoaderService, TemplateConfigValidatorService],
})
export class TemplateSystemModule {}
