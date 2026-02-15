import { TemplateManifest } from '@agentic-template/dto/src/template-system/template-manifest.interface';

export interface TemplateLoadResult {
  manifest: TemplateManifest;
  loaded_from: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  config: Record<string, unknown> | null;
}

export type LoadedManifestCache = Map<string, TemplateManifest>;
