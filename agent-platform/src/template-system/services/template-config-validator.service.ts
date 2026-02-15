import { Injectable, Logger } from '@nestjs/common';
import { TemplateManifest } from '@agentic-template/dto/src/template-system/template-manifest.interface';
import { TemplateValidationResult } from '../interfaces/template-types';
import { TemplateManifestLoaderService } from './template-manifest-loader.service';
import Ajv, { ValidateFunction } from 'ajv';

@Injectable()
export class TemplateConfigValidatorService {
  private readonly logger = new Logger(TemplateConfigValidatorService.name);
  private readonly ajv: Ajv;
  private readonly validatorCache: Map<string, ValidateFunction> = new Map();

  constructor(private readonly manifestLoader: TemplateManifestLoaderService) {
    this.ajv = new Ajv({ allErrors: true });
  }

  private buildValidatorKey(templateId: string, version: string): string {
    return `${templateId}@${version}`;
  }

  private getOrCompileValidator(manifest: TemplateManifest): ValidateFunction {
    const key = this.buildValidatorKey(manifest.template_id, manifest.version);
    const cached = this.validatorCache.get(key);
    if (cached) {
      return cached;
    }

    const validator = this.ajv.compile(manifest.config_schema);
    this.validatorCache.set(key, validator);
    return validator;
  }

  validate(manifest: TemplateManifest, gameConfig: Record<string, unknown>): TemplateValidationResult {
    const validator = this.getOrCompileValidator(manifest);
    const isValid = validator(gameConfig);

    if (isValid) {
      return { valid: true, errors: [], config: gameConfig };
    }

    const errors = validator.errors?.map((e) => {
      const path = e.instancePath || '/';
      return `${path}: ${e.message}`;
    }) || ['Unknown validation error'];

    this.logger.warn(`Config validation failed for ${manifest.template_id}: ${errors.join('; ')}`);

    return { valid: false, errors, config: null };
  }

  async validateByTemplateId(templateId: string, gameConfig: Record<string, unknown>, version?: string): Promise<TemplateValidationResult> {
    let manifest = this.manifestLoader.getManifest(templateId, version);
    if (!manifest) {
      const result = await this.manifestLoader.loadManifest(templateId, version);
      manifest = result.manifest;
    }

    return this.validate(manifest, gameConfig);
  }
}
