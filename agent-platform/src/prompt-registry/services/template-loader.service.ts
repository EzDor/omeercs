import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import * as semver from 'semver';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { JSONSchema } from '@agentic-template/dto/src/prompt-registry/prompt-template.interface';
import { LoadedPromptTemplate, LoadedConfigTemplate, LoadedReviewRubric } from '../interfaces/registry-types';

interface LoadResult<T> {
  items: T[];
  errorCount: number;
}

interface ParsedConfigFile {
  config_id: string;
  version: string;
  description: string;
  vars_schema?: JSONSchema;
  template: Record<string, unknown>;
}

interface ParsedRubricFile {
  rubric_id: string;
  version: string;
  description: string;
  output_schema: JSONSchema;
  criteria: Array<{
    name: string;
    description: string;
    scoring_guidance: string;
    weight?: number;
  }>;
}

@Injectable()
export class TemplateLoaderService {
  private readonly logger = new Logger(TemplateLoaderService.name);
  private readonly ajv: Ajv;
  private readonly promptsDir: string;
  private readonly configsDir: string;
  private readonly rubricsDir: string;

  constructor(private readonly configService: ConfigService) {
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      useDefaults: true,
    });
    addFormats(this.ajv);

    const baseDir = this.configService.get<string>('TEMPLATE_BASE_DIR') || path.join(process.cwd(), '..');
    this.promptsDir = path.join(baseDir, 'agent-platform', 'prompts');
    this.configsDir = path.join(baseDir, 'agent-platform', 'configs');
    this.rubricsDir = path.join(baseDir, 'agent-platform', 'rubrics');
  }

  loadAllPrompts(): LoadResult<LoadedPromptTemplate> {
    return this.loadPromptTemplates(this.promptsDir);
  }

  loadAllConfigs(): LoadResult<LoadedConfigTemplate> {
    return this.loadConfigTemplates(this.configsDir);
  }

  loadAllRubrics(): LoadResult<LoadedReviewRubric> {
    return this.loadRubricFiles(this.rubricsDir);
  }

  private loadPromptTemplates(baseDir: string): LoadResult<LoadedPromptTemplate> {
    const items: LoadedPromptTemplate[] = [];
    let errorCount = 0;

    if (!fs.existsSync(baseDir)) {
      this.logger.warn(`Prompts directory not found: ${baseDir}`);
      return { items, errorCount };
    }

    const promptDirs = fs.readdirSync(baseDir, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const dir of promptDirs) {
      const promptId = dir.name;
      const promptPath = path.join(baseDir, promptId);
      const versionFiles = fs.readdirSync(promptPath).filter((f) => f.endsWith('.md'));

      for (const versionFile of versionFiles) {
        const filePath = path.join(promptPath, versionFile);
        try {
          const loaded = this.parsePromptFile(filePath, promptId);
          if (loaded) {
            items.push(loaded);
          }
        } catch (error) {
          errorCount++;
          this.logger.error(`Failed to load prompt ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return { items, errorCount };
  }

  private parsePromptFile(filePath: string, expectedPromptId: string): LoadedPromptTemplate | null {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content: template } = matter(content);

    const promptId = frontmatter.prompt_id as string;
    const version = frontmatter.version as string;

    if (!promptId || !version) {
      throw new Error('Missing required frontmatter: prompt_id or version');
    }

    if (promptId !== expectedPromptId) {
      throw new Error(`prompt_id "${promptId}" does not match directory name "${expectedPromptId}"`);
    }

    if (!semver.valid(version)) {
      throw new Error(`Invalid semver version: ${version}`);
    }

    const varsSchema = (frontmatter.vars_schema as JSONSchema) || { type: 'object', properties: {} };
    const compiledVarsValidator = this.compileSchema(varsSchema, `prompt_${promptId}_${version}_vars`);
    const extractedVariables = this.extractTemplateVariables(template);

    this.validateTemplateVariables(extractedVariables, varsSchema, promptId);

    return {
      promptId,
      version,
      description: frontmatter.description as string,
      template: template.trim(),
      varsSchema,
      modelDefaults: frontmatter.model_defaults as LoadedPromptTemplate['modelDefaults'],
      outputSchema: frontmatter.output_schema as JSONSchema,
      compiledVarsValidator,
      extractedVariables,
    };
  }

  private loadConfigTemplates(baseDir: string): LoadResult<LoadedConfigTemplate> {
    const items: LoadedConfigTemplate[] = [];
    let errorCount = 0;

    if (!fs.existsSync(baseDir)) {
      this.logger.warn(`Configs directory not found: ${baseDir}`);
      return { items, errorCount };
    }

    const configDirs = fs.readdirSync(baseDir, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const dir of configDirs) {
      const configId = dir.name;
      const configPath = path.join(baseDir, configId);
      const versionFiles = fs.readdirSync(configPath).filter((f) => f.endsWith('.json'));

      for (const versionFile of versionFiles) {
        const filePath = path.join(configPath, versionFile);
        try {
          const loaded = this.parseConfigFile(filePath, configId);
          if (loaded) {
            items.push(loaded);
          }
        } catch (error) {
          errorCount++;
          this.logger.error(`Failed to load config ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return { items, errorCount };
  }

  private parseConfigFile(filePath: string, expectedConfigId: string): LoadedConfigTemplate | null {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as ParsedConfigFile;

    const configId = parsed.config_id;
    const version = parsed.version;

    if (!configId || !version) {
      throw new Error('Missing required fields: config_id or version');
    }

    if (configId !== expectedConfigId) {
      throw new Error(`config_id "${configId}" does not match directory name "${expectedConfigId}"`);
    }

    if (!semver.valid(version)) {
      throw new Error(`Invalid semver version: ${version}`);
    }

    const varsSchema = parsed.vars_schema || { type: 'object', properties: {} };
    const compiledVarsValidator = this.compileSchema(varsSchema, `config_${configId}_${version}_vars`);

    return {
      configId,
      version,
      description: parsed.description,
      template: parsed.template,
      varsSchema,
      compiledVarsValidator,
    };
  }

  private loadRubricFiles(baseDir: string): LoadResult<LoadedReviewRubric> {
    const items: LoadedReviewRubric[] = [];
    let errorCount = 0;

    if (!fs.existsSync(baseDir)) {
      this.logger.warn(`Rubrics directory not found: ${baseDir}`);
      return { items, errorCount };
    }

    const rubricDirs = fs.readdirSync(baseDir, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const dir of rubricDirs) {
      const rubricId = dir.name;
      const rubricPath = path.join(baseDir, rubricId);
      const versionFiles = fs.readdirSync(rubricPath).filter((f) => f.endsWith('.json'));

      for (const versionFile of versionFiles) {
        const filePath = path.join(rubricPath, versionFile);
        try {
          const loaded = this.parseRubricFile(filePath, rubricId);
          if (loaded) {
            items.push(loaded);
          }
        } catch (error) {
          errorCount++;
          this.logger.error(`Failed to load rubric ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return { items, errorCount };
  }

  private parseRubricFile(filePath: string, expectedRubricId: string): LoadedReviewRubric | null {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as ParsedRubricFile;

    const rubricId = parsed.rubric_id;
    const version = parsed.version;

    if (!rubricId || !version) {
      throw new Error('Missing required fields: rubric_id or version');
    }

    if (rubricId !== expectedRubricId) {
      throw new Error(`rubric_id "${rubricId}" does not match directory name "${expectedRubricId}"`);
    }

    if (!semver.valid(version)) {
      throw new Error(`Invalid semver version: ${version}`);
    }

    const outputSchema = parsed.output_schema;
    if (!outputSchema) {
      throw new Error('Missing required field: output_schema');
    }

    const compiledOutputValidator = this.compileSchema(outputSchema, `rubric_${rubricId}_${version}_output`);

    const criteria = parsed.criteria.map((c) => ({
      name: c.name,
      description: c.description,
      scoringGuidance: c.scoring_guidance,
      weight: c.weight,
    }));

    return {
      rubricId,
      version,
      description: parsed.description,
      criteria,
      outputSchema,
      compiledOutputValidator,
    };
  }

  private compileSchema(schema: JSONSchema, schemaId: string): ValidateFunction {
    try {
      return this.ajv.compile(schema);
    } catch (error) {
      throw new Error(`Invalid JSON Schema (${schemaId}): ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  extractTemplateVariables(template: string): string[] {
    const regex = /\{([^{}]+)\}/g;
    const variables = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(template)) !== null) {
      const captured = match[1];
      if (captured) {
        const varName = captured.trim().split('.')[0];
        if (varName) {
          variables.add(varName);
        }
      }
    }

    return Array.from(variables);
  }

  private validateTemplateVariables(variables: string[], varsSchema: JSONSchema, promptId: string): void {
    const schemaProperties = (varsSchema.properties as Record<string, unknown>) || {};
    const missingInSchema: string[] = [];

    for (const variable of variables) {
      if (!schemaProperties[variable]) {
        missingInSchema.push(variable);
      }
    }

    if (missingInSchema.length > 0) {
      this.logger.warn(`Prompt ${promptId}: Template variables not defined in vars_schema: ${missingInSchema.join(', ')}`);
    }
  }

  sortVersionsDescending(versions: string[]): string[] {
    return versions.sort((a, b) => (semver.gt(a, b) ? -1 : semver.lt(a, b) ? 1 : 0));
  }
}
