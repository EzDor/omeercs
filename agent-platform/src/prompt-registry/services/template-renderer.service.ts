import { Injectable, Logger } from '@nestjs/common';
import type { ValidateFunction, ErrorObject } from 'ajv';
import type { RegistryResult, ValidationError } from '@agentic-template/dto/src/prompt-registry/registry-result.interface';
import type { RenderedPrompt } from '@agentic-template/dto/src/prompt-registry/prompt-template.interface';
import type { RenderedConfig } from '@agentic-template/dto/src/prompt-registry/config-template.interface';
import type { LoadedPromptTemplate, LoadedConfigTemplate } from '../interfaces/registry-types';

@Injectable()
export class TemplateRendererService {
  private readonly logger = new Logger(TemplateRendererService.name);

  renderPrompt(template: LoadedPromptTemplate, vars: Record<string, unknown>): RegistryResult<RenderedPrompt> {
    const validationResult = this.validateVars(template.compiledVarsValidator, vars, template.promptId);
    if (!validationResult.ok) {
      return validationResult;
    }

    try {
      const content = this.renderFString(template.template, vars);

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
        result[key] = this.renderFString(value, vars);
      } else if (Array.isArray(value)) {
        result[key] = (value as unknown[]).map((item: unknown): unknown => {
          if (typeof item === 'string') {
            return this.renderFString(item, vars);
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

  private renderFString(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{([^{}]+)\}/g, (_match, key: string) => {
      const value = this.getNestedValue(vars, key.trim());
      return this.valueToString(value);
    });
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, part) => (current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined), obj as unknown);
  }

  private valueToString(value: unknown): string {
    if (value === undefined || value === null) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return '';
  }
}
