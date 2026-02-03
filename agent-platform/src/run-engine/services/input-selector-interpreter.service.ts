import { Injectable, Logger } from '@nestjs/common';
import type { RunContext, StepOutput } from '../interfaces/run-context.interface';
import type { CompiledInputSelector } from '../interfaces/input-selector.interface';
import type {
  InputSelectorYaml,
  InputSelectorFieldYaml,
  TriggerSourceSelector,
  StepOutputSourceSelector,
  BaseRunSourceSelector,
  RegistrySourceSelector,
  ConstantsSourceSelector,
  MergeOperationSelector,
  PickOperationSelector,
} from '../interfaces/workflow-yaml.interface';
import { PromptRegistryService } from '../../prompt-registry/services/prompt-registry.service';

@Injectable()
export class InputSelectorInterpreterService {
  private readonly logger = new Logger(InputSelectorInterpreterService.name);
  private readonly DANGEROUS_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);

  constructor(private readonly promptRegistryService: PromptRegistryService) {}

  compile(inputSelectorYaml: InputSelectorYaml): CompiledInputSelector {
    const fieldResolvers = new Map<string, (ctx: RunContext) => unknown>();

    for (const [key, selectorField] of Object.entries(inputSelectorYaml)) {
      const resolver = this.compileField(selectorField);
      fieldResolvers.set(key, resolver);
    }

    return (ctx: RunContext): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const [key, resolver] of fieldResolvers) {
        result[key] = resolver(ctx);
      }
      return result;
    };
  }

  private compileField(field: InputSelectorFieldYaml): (ctx: RunContext) => unknown {
    if ('source' in field) {
      switch (field.source) {
        case 'trigger':
          return this.compileTriggerSelector(field);
        case 'step_output':
          return this.compileStepOutputSelector(field);
        case 'base_run':
          return this.compileBaseRunSelector(field);
        case 'registry':
          return this.compileRegistrySelector(field);
        case 'constants':
          return this.compileConstantsSelector(field);
        default:
          throw new Error(`Unknown selector source: ${(field as { source: string }).source}`);
      }
    } else if ('operation' in field) {
      switch (field.operation) {
        case 'merge':
          return this.compileMergeOperation(field);
        case 'pick':
          return this.compilePickOperation(field);
        default:
          throw new Error(`Unknown selector operation: ${(field as { operation: string }).operation}`);
      }
    }

    throw new Error('Invalid input selector field: must have source or operation');
  }

  private compileTriggerSelector(selector: TriggerSourceSelector): (ctx: RunContext) => unknown {
    const { path } = selector;
    return (ctx: RunContext) => this.getNestedValue(ctx.triggerPayload, path);
  }

  private compileStepOutputSelector(selector: StepOutputSourceSelector): (ctx: RunContext) => unknown {
    const { step_id, path } = selector;
    return (ctx: RunContext) => {
      const stepOutput = ctx.stepOutputs.get(step_id);
      if (!stepOutput) {
        throw new Error(`Step output not found for step: ${step_id}`);
      }
      return this.getStepOutputValue(stepOutput, path);
    };
  }

  private compileBaseRunSelector(selector: BaseRunSourceSelector): (ctx: RunContext) => unknown {
    const { step_id, path } = selector;
    return (ctx: RunContext) => {
      if (!ctx.baseRunOutputs) {
        throw new Error('Base run outputs not available - this is not an update workflow or base run was not loaded');
      }
      const stepOutput = ctx.baseRunOutputs.get(step_id);
      if (!stepOutput) {
        throw new Error(`Base run step output not found for step: ${step_id}`);
      }
      return this.getStepOutputValue(stepOutput, path);
    };
  }

  private compileRegistrySelector(selector: RegistrySourceSelector): (ctx: RunContext) => unknown {
    const { type, id, version } = selector;

    return () => {
      switch (type) {
        case 'prompt': {
          const result = this.promptRegistryService.getPrompt(id, version);
          if (!result.ok) {
            throw new Error(`Registry prompt not found: ${id} (version: ${version || 'latest'})`);
          }
          return result.data;
        }
        case 'config': {
          const result = this.promptRegistryService.getConfig(id, version);
          if (!result.ok) {
            throw new Error(`Registry config not found: ${id} (version: ${version || 'latest'})`);
          }
          return result.data;
        }
        case 'rubric': {
          const result = this.promptRegistryService.getRubric(id, version);
          if (!result.ok) {
            throw new Error(`Registry rubric not found: ${id} (version: ${version || 'latest'})`);
          }
          return result.data;
        }
        default:
          throw new Error(`Unknown registry type: ${String(type)}`);
      }
    };
  }

  private compileConstantsSelector(selector: ConstantsSourceSelector): (ctx: RunContext) => unknown {
    const { value } = selector;
    return () => value;
  }

  private compileMergeOperation(selector: MergeOperationSelector): (ctx: RunContext) => unknown {
    const compiledInputs = selector.inputs.map((input) => this.compileField(input));

    return (ctx: RunContext) => {
      const result: Record<string, unknown> = {};
      const seen = new WeakSet<object>();

      for (const resolver of compiledInputs) {
        const value = resolver(ctx);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          if (seen.has(value)) {
            throw new Error('Circular reference detected in merge operation');
          }
          seen.add(value);

          for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            if (!this.DANGEROUS_PROPERTIES.has(key)) {
              result[key] = val;
            }
          }
        } else {
          throw new Error('Merge operation requires all inputs to be objects');
        }
      }
      return result;
    };
  }

  private compilePickOperation(selector: PickOperationSelector): (ctx: RunContext) => unknown {
    const compiledInput = this.compileField(selector.input);
    const { keys } = selector;

    return (ctx: RunContext) => {
      const value = compiledInput(ctx);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Pick operation requires input to be an object');
      }

      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in (value as Record<string, unknown>)) {
          result[key] = (value as Record<string, unknown>)[key];
        }
      }
      return result;
    };
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    if (path === '' || path === '.') {
      return obj;
    }

    const parts = this.parsePath(path);
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const index = parseInt(part, 10);
        if (isNaN(index) || index < 0 || index >= current.length) {
          return undefined;
        }
        current = current[index];
      } else if (typeof current === 'object') {
        if (this.DANGEROUS_PROPERTIES.has(part)) {
          return undefined;
        }
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private parsePath(pathStr: string): string[] {
    const result: string[] = [];
    let current = '';
    let bracketDepth = 0;

    for (const char of pathStr) {
      if (char === '[') {
        if (current) {
          result.push(current);
          current = '';
        }
        bracketDepth++;
      } else if (char === ']') {
        bracketDepth--;
        if (bracketDepth < 0) {
          throw new Error(`Malformed path: unbalanced brackets in '${pathStr}'`);
        }
        if (current) {
          result.push(current);
          current = '';
        }
      } else if (char === '.' && bracketDepth === 0) {
        if (current) {
          result.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (bracketDepth !== 0) {
      throw new Error(`Malformed path: unclosed bracket in '${pathStr}'`);
    }

    if (current) {
      result.push(current);
    }

    return result;
  }

  private getStepOutputValue(stepOutput: StepOutput, path: string): unknown {
    const parts = this.parsePath(path);
    if (parts.length === 0) {
      return stepOutput;
    }

    const firstPart = parts[0];
    let current: unknown;

    if (firstPart === 'data') {
      current = stepOutput.data;
      parts.shift();
    } else if (firstPart === 'artifacts' || firstPart === 'outputArtifactIds') {
      current = stepOutput.outputArtifactIds;
      parts.shift();
    } else if (firstPart === 'status') {
      current = stepOutput.status;
      parts.shift();
    } else if (firstPart === 'stepId') {
      current = stepOutput.stepId;
      parts.shift();
    } else {
      current = stepOutput.data;
    }

    if (parts.length === 0) {
      return current;
    }

    return this.getNestedValue(current, parts.join('.'));
  }
}
