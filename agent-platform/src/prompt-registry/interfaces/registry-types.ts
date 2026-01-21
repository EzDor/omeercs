import type { ValidateFunction } from 'ajv';
import type { JSONSchema, ModelDefaults } from '@agentic-template/dto/src/prompt-registry';

export interface LoadedPromptTemplate {
  promptId: string;
  version: string;
  description: string;
  template: string;
  varsSchema: JSONSchema;
  modelDefaults?: ModelDefaults;
  outputSchema?: JSONSchema;
  compiledVarsValidator: ValidateFunction;
  extractedVariables: string[];
}

export interface LoadedConfigTemplate {
  configId: string;
  version: string;
  description: string;
  template: Record<string, unknown>;
  varsSchema: JSONSchema;
  compiledVarsValidator: ValidateFunction;
}

export interface LoadedReviewRubric {
  rubricId: string;
  version: string;
  description: string;
  criteria: LoadedRubricCriterion[];
  outputSchema: JSONSchema;
  compiledOutputValidator: ValidateFunction;
}

export interface LoadedRubricCriterion {
  name: string;
  description: string;
  scoringGuidance: string;
  weight?: number;
}

export interface PromptRegistryState {
  prompts: Map<string, Map<string, LoadedPromptTemplate>>;
  configs: Map<string, Map<string, LoadedConfigTemplate>>;
  rubrics: Map<string, Map<string, LoadedReviewRubric>>;
  promptVersions: Map<string, string[]>;
  configVersions: Map<string, string[]>;
  rubricVersions: Map<string, string[]>;
}
