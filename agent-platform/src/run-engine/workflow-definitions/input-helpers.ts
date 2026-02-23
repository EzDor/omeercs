import type { RunContext, StepOutput } from '../interfaces/run-context.interface';

const DANGEROUS_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);

const STEP_OUTPUT_PROPERTY_MAP: Record<string, keyof StepOutput> = {
  data: 'data',
  artifacts: 'outputArtifactIds',
  outputArtifactIds: 'outputArtifactIds',
  status: 'status',
  stepId: 'stepId',
};

type FieldResolver = (ctx: RunContext) => unknown;

function parsePath(pathStr: string): string[] {
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

function getNestedValue(obj: unknown, path: string): unknown {
  if (path === '' || path === '.') {
    return obj;
  }

  const parts = parsePath(path);
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
      if (DANGEROUS_PROPERTIES.has(part)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

function resolveStepOutputRoot(stepOutput: StepOutput, parts: string[]): { rootValue: unknown; remainingParts: string[] } {
  const firstPart = parts[0];
  const mappedProperty = STEP_OUTPUT_PROPERTY_MAP[firstPart];

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

function getStepOutputValue(stepOutput: StepOutput, path: string): unknown {
  const parts = parsePath(path);
  if (parts.length === 0) {
    return stepOutput;
  }

  const { rootValue, remainingParts } = resolveStepOutputRoot(stepOutput, parts);

  if (remainingParts.length === 0) {
    return rootValue;
  }

  return getNestedValue(rootValue, remainingParts.join('.'));
}

export function fromTrigger(path: string): FieldResolver {
  return (ctx: RunContext) => getNestedValue(ctx.triggerPayload, path);
}

export function fromStep(stepId: string, path: string): FieldResolver {
  return (ctx: RunContext) => {
    const stepOutput = ctx.stepOutputs.get(stepId);
    if (!stepOutput) {
      throw new Error(`Step output not found for step: ${stepId}`);
    }
    return getStepOutputValue(stepOutput, path);
  };
}

export function fromBaseRun(stepId: string, path: string): FieldResolver {
  return (ctx: RunContext) => {
    if (!ctx.baseRunOutputs) {
      throw new Error('Base run outputs not available - this is not an update workflow or base run was not loaded');
    }
    const stepOutput = ctx.baseRunOutputs.get(stepId);
    if (!stepOutput) {
      throw new Error(`Base run step output not found for step: ${stepId}`);
    }
    return getStepOutputValue(stepOutput, path);
  };
}

export function constant(value: unknown): FieldResolver {
  return () => value;
}

export function merge(...resolvers: FieldResolver[]): FieldResolver {
  return (ctx: RunContext) => {
    const result: Record<string, unknown> = {};
    for (const resolver of resolvers) {
      const value = resolver(ctx);
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Merge operation requires all inputs to be objects');
      }
      for (const [key, val] of Object.entries(value)) {
        if (!DANGEROUS_PROPERTIES.has(key)) {
          result[key] = val;
        }
      }
    }
    return result;
  };
}

export function inputSelector(fields: Record<string, FieldResolver>): (ctx: RunContext) => Record<string, unknown> {
  return (ctx: RunContext): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, resolver] of Object.entries(fields)) {
      result[key] = resolver(ctx);
    }
    return result;
  };
}
