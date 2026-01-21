export type JSONSchema = Record<string, unknown>;

export interface ModelDefaults {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface PromptTemplate {
  promptId: string;
  version: string;
  description: string;
  template: string;
  varsSchema: JSONSchema;
  modelDefaults?: ModelDefaults;
  outputSchema?: JSONSchema;
}

export interface RenderedPrompt {
  content: string;
  promptId: string;
  version: string;
  modelDefaults?: ModelDefaults;
  outputSchema?: JSONSchema;
  varsApplied: Record<string, unknown>;
}
