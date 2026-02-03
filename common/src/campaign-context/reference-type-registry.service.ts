import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StandardArtifactTypes } from '@agentic-template/dto/src/campaign-context/standard-artifact-types.enum';
import * as fs from 'fs';
import * as path from 'path';
import Ajv, { type ValidateFunction } from 'ajv';
import artifactTypesSchema from './schemas/artifact-types.schema.json';

interface CustomTypeConfig {
  name: string;
  description: string;
}

interface ArtifactTypesConfig {
  customTypes: CustomTypeConfig[];
}

@Injectable()
export class ReferenceTypeRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ReferenceTypeRegistryService.name);
  private readonly standardTypes: Set<string>;
  private readonly customTypes: Set<string> = new Set();
  private readonly allTypes: Set<string>;
  private readonly schemaValidator: ValidateFunction<ArtifactTypesConfig>;

  constructor() {
    this.standardTypes = new Set(Object.values(StandardArtifactTypes));
    this.allTypes = new Set(this.standardTypes);

    const ajv = new Ajv();
    this.schemaValidator = ajv.compile<ArtifactTypesConfig>(artifactTypesSchema);
  }

  async onModuleInit(): Promise<void> {
    await this.loadCustomTypesFromConfig();
  }

  private async loadCustomTypesFromConfig(): Promise<void> {
    const configPath = process.env.ARTIFACT_TYPES_CONFIG_PATH;
    if (!configPath) {
      this.logger.debug('No ARTIFACT_TYPES_CONFIG_PATH set, using only standard types');
      return;
    }

    try {
      const resolvedPath = path.resolve(configPath);

      try {
        await fs.promises.access(resolvedPath, fs.constants.R_OK);
      } catch {
        this.logger.warn(`Artifact types config not found at: ${resolvedPath}`);
        return;
      }

      const content = await fs.promises.readFile(resolvedPath, 'utf-8');
      const config = JSON.parse(content) as unknown;

      if (!this.schemaValidator(config)) {
        this.logger.error('Invalid artifact types config schema:', this.schemaValidator.errors);
        return;
      }

      for (const customType of config.customTypes) {
        if (!this.isValidCustomTypeName(customType.name)) {
          this.logger.warn(`Invalid custom type name: ${customType.name}`);
          continue;
        }

        if (this.standardTypes.has(customType.name)) {
          this.logger.warn(`Custom type conflicts with standard type: ${customType.name}`);
          continue;
        }

        this.customTypes.add(customType.name);
        this.allTypes.add(customType.name);
      }

      this.logger.log(`Loaded ${this.customTypes.size} custom artifact types`);
    } catch (error) {
      this.logger.error(`Failed to load artifact types config: ${String(error)}`);
    }
  }

  private isValidCustomTypeName(name: string): boolean {
    if (typeof name !== 'string') return false;
    if (name.length < 2 || name.length > 50) return false;
    return /^[a-z][a-z0-9_]*$/.test(name);
  }

  isValidType(type: string): boolean {
    return this.allTypes.has(type);
  }

  getRefName(artifactType: string): string {
    const parts = artifactType.split('_');
    const camelCase = parts.map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))).join('');
    return `${camelCase}ArtifactId`;
  }

  listTypes(): string[] {
    return Array.from(this.allTypes);
  }

  listStandardTypes(): string[] {
    return Array.from(this.standardTypes);
  }

  listCustomTypes(): string[] {
    return Array.from(this.customTypes);
  }
}
