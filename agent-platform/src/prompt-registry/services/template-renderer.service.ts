import { Injectable, Logger } from '@nestjs/common';
import * as Mustache from 'mustache';
import type { ValidateFunction, ErrorObject } from 'ajv';
import type { RegistryResult, RenderedPrompt, RenderedConfig, ValidationError } from '@agentic-template/dto/src/prompt-registry';
import type { LoadedPromptTemplate, LoadedConfigTemplate } from '../interfaces/registry-types';

@Injectable()
export class TemplateRendererService {
  private readonly logger = new Logger(TemplateRendererService.name);

  constructor() {
    (Mustache as { escape: (text: string) => string }).escape = (text: string) => text;
  }

  renderPrompt(template: LoadedPromptTemplate, vars: Record<string, unknown>): RegistryResult<RenderedPrompt> {
    const validationResult = this.validateVars(template.compiledVarsValidator, vars, template.promptId);
    if (!validationResult.ok) {
      return validationResult;
    }

    try {
      const content = Mustache.render(template.template, vars);

      return {
        ok: true,
        data: {
          content,
          promptId: template.promptId,
          version: template.version,
          modelDefaults: template.modelDefaults,
          outputSchema: template.outputSchema,
          varsApplied: vars,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: `Failed to render template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        errorCode: 'RENDER_ERROR',
      };
    }
  }

  renderConfig(template: LoadedConfigTemplate, vars: Record<string, unknown>): RegistryResult<RenderedConfig> {
    const validationResult = this.validateVars(template.compiledVarsValidator, vars, template.configId);
    if (!validationResult.ok) {
      return validationResult;
    }

    try {
      const config = this.renderObjectRecursively(template.template, vars);

      return {
        ok: true,
        data: {
          config,
          configId: template.configId,
          version: template.version,
          varsApplied: vars,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: `Failed to render config: ${error instanceof Error ? error.message : 'Unknown error'}`,
        errorCode: 'RENDER_ERROR',
      };
    }
  }

  private validateVars(validator: ValidateFunction, vars: Record<string, unknown>, templateId: string): RegistryResult<void> {
    const varsWithDefaults = { ...vars };
    const valid = validator(varsWithDefaults);

    if (!valid) {
      const validationErrors = this.formatValidationErrors(validator.errors || []);
      return {
        ok: false,
        error: `Variable validation failed for ${templateId}`,
        errorCode: 'VALIDATION_ERROR',
        details: {
          validationErrors,
        },
      };
    }

    return { ok: true, data: undefined };
  }

  private formatValidationErrors(ajvErrors: ErrorObject[]): ValidationError[] {
    return ajvErrors.map((error) => {
      const field = error.instancePath ? error.instancePath.replace(/^\//, '').replace(/\//g, '.') : (error.params?.missingProperty as string) || '';

      let message = error.message || 'Validation failed';

      if (error.keyword === 'required') {
        message = `Missing required field: ${error.params?.missingProperty}`;
      } else if (error.keyword === 'type') {
        message = `Expected ${error.params?.type}`;
      } else if (error.keyword === 'enum') {
        message = `Must be one of: ${(error.params?.allowedValues as string[])?.join(', ')}`;
      }

      return {
        field,
        message,
        value: error.data,
      };
    });
  }

  private renderObjectRecursively(obj: Record<string, unknown>, vars: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = Mustache.render(value, vars);
      } else if (Array.isArray(value)) {
        result[key] = (value as unknown[]).map((item: unknown): unknown => {
          if (typeof item === 'string') {
            return Mustache.render(item, vars);
          } else if (typeof item === 'object' && item !== null) {
            return this.renderObjectRecursively(item as Record<string, unknown>, vars);
          }
          return item;
        });
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.renderObjectRecursively(value as Record<string, unknown>, vars);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
