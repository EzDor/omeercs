import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PromptConfig } from '../interfaces/prompt-config.interface';
import { ModelKwargs } from '../interfaces/model-kwargs.interface';

@Injectable()
export class PromptTemplateService {
  private readonly logger = new Logger(PromptTemplateService.name);

  loadPrompt(promptsDir: string, promptName: string): PromptConfig {
    const promptPath = path.join(promptsDir, `${promptName}.prompt.md`);

    try {
      const content = fs.readFileSync(promptPath, 'utf-8');
      this.logger.log(`Loaded prompt template: ${promptName}`);

      const headerMatch = content.match(/--- HEADER START ---\s*([\s\S]*?)\s*--- HEADER END ---/);
      const promptMatch = content.match(/--- PROMPT START ---\s*([\s\S]*?)\s*--- PROMPT END ---/);

      if (!headerMatch || !promptMatch) {
        throw new Error(`Invalid prompt format: ${promptName}. Missing HEADER or PROMPT sections.`);
      }

      return this.parseHeaderBasedPrompt(headerMatch[1], promptMatch[1]);
    } catch (error) {
      this.logger.error(`Failed to load prompt template: ${promptName}`, error);
      throw new Error(`Prompt template not found or invalid: ${promptName}`);
    }
  }

  private parseHeaderBasedPrompt(headerContent: string, promptContent: string): PromptConfig {
    let langsmithUrl: string | undefined;
    let langsmithCommit: string | undefined;
    let modelKwargs: ModelKwargs | undefined;

    headerContent.split('\n').forEach((line) => {
      const match = line.match(/^@(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        if (key === 'model_kwargs') {
          try {
            modelKwargs = JSON.parse(value) as ModelKwargs;
          } catch (error) {
            this.logger.warn(`Failed to parse model_kwargs: ${value}`, error);
          }
        } else if (key === 'langsmith_url') {
          langsmithUrl = value;
        } else if (key === 'langsmith_commit') {
          langsmithCommit = value;
        }
      }
    });

    return {
      langsmith_url: langsmithUrl,
      langsmith_commit: langsmithCommit,
      prompt: promptContent.trim(),
      model_kwargs: modelKwargs,
    };
  }

  interpolate(template: string, variables: Record<string, unknown>): string {
    const requiredVariables = this.extractVariableNames(template);
    const missingVariables = requiredVariables.filter((varName) => !(varName in variables));

    if (missingVariables.length > 0) {
      const errorMessage = `Missing required variables: ${missingVariables.join(', ')}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    const interpolated = template.replace(/{(\w+)}/g, (_, key: string) => {
      const value = variables[key];
      return this.formatValue(value);
    });

    this.logger.debug('Prompt template interpolated successfully');
    return interpolated;
  }

  loadAndInterpolate(promptsDir: string, promptName: string, variables: Record<string, unknown>): PromptConfig {
    const promptConfig = this.loadPrompt(promptsDir, promptName);
    const interpolatedPrompt = this.interpolate(promptConfig.prompt, variables);
    return {
      ...promptConfig,
      prompt: interpolatedPrompt,
    };
  }

  private extractVariableNames(template: string): string[] {
    const matches = template.match(/{(\w+)}/g);
    if (!matches) {
      return [];
    }

    return matches.map((match) => match.replace(/[{}]/g, ''));
  }

  private formatValue(value: unknown): string {
    if (Array.isArray(value)) {
      return JSON.stringify(value, null, 2);
    }

    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }
}
