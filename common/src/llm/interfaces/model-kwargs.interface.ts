export interface ModelKwargs {
  model?: string;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_tokens?: number;
  [key: string]: unknown;
}
