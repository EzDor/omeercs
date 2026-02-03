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
  private readonly STEP_OUTPUT_PROPERTY_MAP: Record<string, keyof StepOutput> = {
    data: 'data',
    artifacts: 'outputArtifactIds',
    outputArtifactIds: 'outputArtifactIds',
    status: 'status',
    stepId: 'stepId',
  };

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
        case 'prompt':
          return this.fetchRegistryItem('prompt', id, version);
        case 'config':
          return this.fetchRegistryItem('config', id, version);
        case 'rubric':
          return this.fetchRegistryItem('rubric', id, version);
        default:
          throw new Error(`Unknown registry type: ${String(type)}`);
      }
    };
  }

  private fetchRegistryItem(type: 'prompt' | 'config' | 'rubric', id: string, version?: string): unknown {
    const fetchers = {
      prompt: () => this.promptRegistryService.getPrompt(id, version),
      config: () => this.promptRegistryService.getConfig(id, version),
      rubric: () => this.promptRegistryService.getRubric(id, version),
    };

    const result = fetchers[type]();
    if (!result.ok) {
      throw new Error(`Registry ${type} not found: ${id} (version: ${version || 'latest'})`);
    }
    return result.data;
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
        this.validateMergeableObject(value);
        this.detectCircularReference(value, seen);
        seen.add(value);
        this.mergeObjectProperties(value, result);
      }
      return result;
    };
  }

  private compilePickOperation(selector: PickOperationSelector): (ctx: RunContext) => unknown {
    const compiledInput = this.compileField(selector.input);
    const { keys } = selector;

    return (ctx: RunContext) => {
      const value = compiledInput(ctx);
      this.validatePickableObject(value);

      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in value) {
          result[key] = value[key];
        }
      }
      return result;
    };
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    if (this.isRootPath(path)) {
      return obj;
    }

    const parts = this.parsePath(path);
    let current: unknown = obj;

    for (const part of parts) {
      if (this.isNullish(current)) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const index = this.parseArrayIndex(part);
        if (!this.isValidArrayIndex(index, current.length)) {
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

    const { rootValue, remainingParts } = this.resolveStepOutputRoot(stepOutput, parts);

    if (remainingParts.length === 0) {
      return rootValue;
    }

    return this.getNestedValue(rootValue, remainingParts.join('.'));
  }

  private resolveStepOutputRoot(stepOutput: StepOutput, parts: string[]): { rootValue: unknown; remainingParts: string[] } {
    const firstPart = parts[0];
    const mappedProperty = this.STEP_OUTPUT_PROPERTY_MAP[firstPart];

    if (mappedProperty) {
      return {
        rootValue: stepOutput[mappedProperty],
        remainingParts: parts.slice(1),
      };
    }

    return {
      rootValue: stepOutput.data,
      remainingParts: parts,
    };
  }

  private isMergeableObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private isValidArrayIndex(index: number, arrayLength: number): boolean {
    return !isNaN(index) && index >= 0 && index < arrayLength;
  }

  private parseArrayIndex(part: string): number {
    return parseInt(part, 10);
  }

  private isRootPath(path: string): boolean {
    return path === '' || path === '.';
  }

  private isNullish(value: unknown): value is null | undefined {
    return value === null || value === undefined;
  }

  private validateMergeableObject(value: unknown): asserts value is Record<string, unknown> {
    if (!this.isMergeableObject(value)) {
      throw new Error('Merge operation requires all inputs to be objects');
    }
  }

  private detectCircularReference(value: object, seen: WeakSet<object>): void {
    if (seen.has(value)) {
      throw new Error('Circular reference detected in merge operation');
    }
  }

  private mergeObjectProperties(source: Record<string, unknown>, target: Record<string, unknown>): void {
    for (const [key, val] of Object.entries(source)) {
      if (!this.DANGEROUS_PROPERTIES.has(key)) {
        target[key] = val;
      }
    }
  }

  private validatePickableObject(value: unknown): asserts value is Record<string, unknown> {
    if (!this.isMergeableObject(value)) {
      throw new Error('Pick operation requires input to be an object');
    }
  }
}
