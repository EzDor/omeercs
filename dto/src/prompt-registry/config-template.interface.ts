import type { JSONSchema } from './prompt-template.interface';

export interface ConfigTemplate {
  configId: string;
  version: string;
  description: string;
  template: Record<string, unknown>;
  varsSchema: JSONSchema;
}

export interface RenderedConfig {
  config: Record<string, unknown>;
  configId: string;
  version: string;
  varsApplied: Record<string, unknown>;
}
