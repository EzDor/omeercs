import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PromptTemplate, RenderedPrompt } from '@agentic-template/dto/src/prompt-registry/prompt-template.interface';
import type { ConfigTemplate, RenderedConfig } from '@agentic-template/dto/src/prompt-registry/config-template.interface';
import type { ReviewRubric, RubricCriterion } from '@agentic-template/dto/src/prompt-registry/review-rubric.interface';
import type { RegistryResult } from '@agentic-template/dto/src/prompt-registry/registry-result.interface';
import { TemplateLoaderService } from './template-loader.service';
import { TemplateRendererService } from './template-renderer.service';
import type { LoadedPromptTemplate, LoadedConfigTemplate, LoadedReviewRubric, PromptRegistryState } from '../interfaces/registry-types';

@Injectable()
export class PromptRegistryService implements OnModuleInit {
  private readonly logger = new Logger(PromptRegistryService.name);
  private readonly state: PromptRegistryState = {
    prompts: new Map(),
    configs: new Map(),
    rubrics: new Map(),
    promptVersions: new Map(),
    configVersions: new Map(),
    rubricVersions: new Map(),
  };

  constructor(
    private readonly templateLoader: TemplateLoaderService,
    private readonly templateRenderer: TemplateRendererService,
  ) {}

  onModuleInit(): void {
    this.loadAllTemplates();
  }

  private loadAllTemplates(): void {
    this.logger.log('Loading templates...');

    const promptResult = this.templateLoader.loadAllPrompts();
    for (const prompt of promptResult.items) {
      this.addPromptToState(prompt);
    }

    const configResult = this.templateLoader.loadAllConfigs();
    for (const config of configResult.items) {
      this.addConfigToState(config);
    }

    const rubricResult = this.templateLoader.loadAllRubrics();
    for (const rubric of rubricResult.items) {
      this.addRubricToState(rubric);
    }

    this.logger.log(`Loaded ${this.state.prompts.size} prompt(s), ${this.state.configs.size} config(s), ${this.state.rubrics.size} rubric(s)`);

    if (promptResult.errorCount > 0 || configResult.errorCount > 0 || rubricResult.errorCount > 0) {
      this.logger.warn(`Load errors: ${promptResult.errorCount} prompts, ${configResult.errorCount} configs, ${rubricResult.errorCount} rubrics`);
    }
  }

  private addPromptToState(prompt: LoadedPromptTemplate): void {
    if (!this.state.prompts.has(prompt.promptId)) {
      this.state.prompts.set(prompt.promptId, new Map());
      this.state.promptVersions.set(prompt.promptId, []);
    }

    this.state.prompts.get(prompt.promptId)!.set(prompt.version, prompt);

    const versions = this.state.promptVersions.get(prompt.promptId)!;
    versions.push(prompt.version);
    this.state.promptVersions.set(prompt.promptId, this.templateLoader.sortVersionsDescending(versions));
  }

  private addConfigToState(config: LoadedConfigTemplate): void {
    if (!this.state.configs.has(config.configId)) {
      this.state.configs.set(config.configId, new Map());
      this.state.configVersions.set(config.configId, []);
    }

    this.state.configs.get(config.configId)!.set(config.version, config);

    const versions = this.state.configVersions.get(config.configId)!;
    versions.push(config.version);
    this.state.configVersions.set(config.configId, this.templateLoader.sortVersionsDescending(versions));
  }

  private addRubricToState(rubric: LoadedReviewRubric): void {
    if (!this.state.rubrics.has(rubric.rubricId)) {
      this.state.rubrics.set(rubric.rubricId, new Map());
      this.state.rubricVersions.set(rubric.rubricId, []);
    }

    this.state.rubrics.get(rubric.rubricId)!.set(rubric.version, rubric);

    const versions = this.state.rubricVersions.get(rubric.rubricId)!;
    versions.push(rubric.version);
    this.state.rubricVersions.set(rubric.rubricId, this.templateLoader.sortVersionsDescending(versions));
  }

  getPrompt(promptId: string, version?: string): RegistryResult<PromptTemplate> {
    const versionMap = this.state.prompts.get(promptId);
    if (!versionMap) {
      return {
        ok: false,
        error: `Prompt not found: ${promptId}`,
        errorCode: 'TEMPLATE_NOT_FOUND',
      };
    }

    const targetVersion = version || this.state.promptVersions.get(promptId)?.[0];
    if (!targetVersion) {
      return {
        ok: false,
        error: `No versions available for prompt: ${promptId}`,
        errorCode: 'VERSION_NOT_FOUND',
      };
    }

    const loaded = versionMap.get(targetVersion);
    if (!loaded) {
      return {
        ok: false,
        error: `Version ${targetVersion} not found for prompt: ${promptId}`,
        errorCode: 'VERSION_NOT_FOUND',
        details: {
          availableVersions: this.state.promptVersions.get(promptId) || [],
        },
      };
    }

    return {
      ok: true,
      data: {
        promptId: loaded.promptId,
        version: loaded.version,
        description: loaded.description,
        template: loaded.template,
        varsSchema: loaded.varsSchema,
        modelDefaults: loaded.modelDefaults,
        outputSchema: loaded.outputSchema,
      },
    };
  }

  renderPrompt(promptId: string, version: string, vars: Record<string, unknown>): RegistryResult<RenderedPrompt> {
    const versionMap = this.state.prompts.get(promptId);
    if (!versionMap) {
      return {
        ok: false,
        error: `Prompt not found: ${promptId}`,
        errorCode: 'TEMPLATE_NOT_FOUND',
      };
    }

    const loaded = versionMap.get(version);
    if (!loaded) {
      return {
        ok: false,
        error: `Version ${version} not found for prompt: ${promptId}`,
        errorCode: 'VERSION_NOT_FOUND',
        details: {
          availableVersions: this.state.promptVersions.get(promptId) || [],
        },
      };
    }

    return this.templateRenderer.renderPrompt(loaded, vars);
  }

  listPrompts(): string[] {
    return Array.from(this.state.prompts.keys());
  }

  listPromptVersions(promptId: string): string[] {
    return this.state.promptVersions.get(promptId) || [];
  }

  getConfig(configId: string, version?: string): RegistryResult<ConfigTemplate> {
    const versionMap = this.state.configs.get(configId);
    if (!versionMap) {
      return {
        ok: false,
        error: `Config not found: ${configId}`,
        errorCode: 'TEMPLATE_NOT_FOUND',
      };
    }

    const targetVersion = version || this.state.configVersions.get(configId)?.[0];
    if (!targetVersion) {
      return {
        ok: false,
        error: `No versions available for config: ${configId}`,
        errorCode: 'VERSION_NOT_FOUND',
      };
    }

    const loaded = versionMap.get(targetVersion);
    if (!loaded) {
      return {
        ok: false,
        error: `Version ${targetVersion} not found for config: ${configId}`,
        errorCode: 'VERSION_NOT_FOUND',
        details: {
          availableVersions: this.state.configVersions.get(configId) || [],
        },
      };
    }

    return {
      ok: true,
      data: {
        configId: loaded.configId,
        version: loaded.version,
        description: loaded.description,
        template: loaded.template,
        varsSchema: loaded.varsSchema,
      },
    };
  }

  renderConfig(configId: string, version: string, vars: Record<string, unknown>): RegistryResult<RenderedConfig> {
    const versionMap = this.state.configs.get(configId);
    if (!versionMap) {
      return {
        ok: false,
        error: `Config not found: ${configId}`,
        errorCode: 'TEMPLATE_NOT_FOUND',
      };
    }

    const loaded = versionMap.get(version);
    if (!loaded) {
      return {
        ok: false,
        error: `Version ${version} not found for config: ${configId}`,
        errorCode: 'VERSION_NOT_FOUND',
        details: {
          availableVersions: this.state.configVersions.get(configId) || [],
        },
      };
    }

    return this.templateRenderer.renderConfig(loaded, vars);
  }

  listConfigs(): string[] {
    return Array.from(this.state.configs.keys());
  }

  listConfigVersions(configId: string): string[] {
    return this.state.configVersions.get(configId) || [];
  }

  getRubric(rubricId: string, version?: string): RegistryResult<ReviewRubric> {
    const versionMap = this.state.rubrics.get(rubricId);
    if (!versionMap) {
      return {
        ok: false,
        error: `Rubric not found: ${rubricId}`,
        errorCode: 'TEMPLATE_NOT_FOUND',
      };
    }

    const targetVersion = version || this.state.rubricVersions.get(rubricId)?.[0];
    if (!targetVersion) {
      return {
        ok: false,
        error: `No versions available for rubric: ${rubricId}`,
        errorCode: 'VERSION_NOT_FOUND',
      };
    }

    const loaded = versionMap.get(targetVersion);
    if (!loaded) {
      return {
        ok: false,
        error: `Version ${targetVersion} not found for rubric: ${rubricId}`,
        errorCode: 'VERSION_NOT_FOUND',
        details: {
          availableVersions: this.state.rubricVersions.get(rubricId) || [],
        },
      };
    }

    const criteria: RubricCriterion[] = loaded.criteria.map((c) => ({
      name: c.name,
      description: c.description,
      scoringGuidance: c.scoringGuidance,
      weight: c.weight,
    }));

    return {
      ok: true,
      data: {
        rubricId: loaded.rubricId,
        version: loaded.version,
        description: loaded.description,
        criteria,
        outputSchema: loaded.outputSchema,
      },
    };
  }

  listRubrics(): string[] {
    return Array.from(this.state.rubrics.keys());
  }

  listRubricVersions(rubricId: string): string[] {
    return this.state.rubricVersions.get(rubricId) || [];
  }
}
