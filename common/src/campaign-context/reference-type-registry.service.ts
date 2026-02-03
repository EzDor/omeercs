import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StandardArtifactTypes } from '@agentic-template/dto/src/campaign-context/standard-artifact-types.enum';
import * as fs from 'fs';
import * as path from 'path';

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

  constructor() {
    this.standardTypes = new Set(Object.values(StandardArtifactTypes));
    this.allTypes = new Set(this.standardTypes);
  }

  onModuleInit(): void {
    this.loadCustomTypesFromConfig();
  }

  private loadCustomTypesFromConfig(): void {
    const configPath = process.env.ARTIFACT_TYPES_CONFIG_PATH;
    if (!configPath) {
      this.logger.debug('No ARTIFACT_TYPES_CONFIG_PATH set, using only standard types');
      return;
    }

    try {
      const resolvedPath = path.resolve(configPath);
      if (!fs.existsSync(resolvedPath)) {
        this.logger.warn(`Artifact types config not found at: ${resolvedPath}`);
        return;
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const config = JSON.parse(content) as ArtifactTypesConfig;

      if (!config.customTypes || !Array.isArray(config.customTypes)) {
        this.logger.warn('Invalid artifact types config: missing or invalid customTypes array');
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
