import { ModelKwargs } from './model-kwargs.interface';

export interface PromptConfig {
  langsmith_url?: string;
  langsmith_commit?: string;
  prompt: string;
  model_kwargs?: ModelKwargs;
}
