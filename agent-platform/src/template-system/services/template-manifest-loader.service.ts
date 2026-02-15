import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TemplateManifest } from '@agentic-template/dto/src/template-system/template-manifest.interface';
import { TemplateLoadResult, LoadedManifestCache } from '../interfaces/template-types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';

const MANIFEST_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['template_id', 'version', 'title', 'description', 'config_schema', 'asset_slots', 'scene_config', 'entry_point'],
  properties: {
    template_id: { type: 'string', enum: ['spin_wheel', 'quiz', 'scratch_card', 'memory_match'] },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    title: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', minLength: 1, maxLength: 500 },
    config_schema: {
      type: 'object',
      required: ['type', 'properties'],
      properties: { type: { const: 'object' }, required: { type: 'array', items: { type: 'string' } }, properties: { type: 'object' } },
    },
    asset_slots: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['slot_id', 'type', 'required'],
        properties: {
          slot_id: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
          type: { type: 'string', enum: ['image', 'audio', 'model_3d', 'texture', 'environment_map'] },
          formats: { type: 'array', items: { type: 'string' } },
          required: { type: 'boolean' },
          default: { type: 'string' },
          description: { type: 'string' },
          max_size_bytes: { type: 'integer', minimum: 0 },
        },
      },
    },
    scene_config: {
      type: 'object',
      required: ['camera', 'lighting'],
      properties: {
        camera: {
          type: 'object',
          required: ['type', 'fov', 'position', 'look_at'],
          properties: {
            type: { type: 'string', enum: ['perspective', 'orthographic'] },
            fov: { type: 'number', minimum: 10, maximum: 120 },
            position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
            look_at: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
          },
        },
        lighting: {
          type: 'object',
          required: ['ambient'],
          properties: {
            ambient: {
              type: 'object',
              required: ['color', 'intensity'],
              properties: { color: { type: 'string' }, intensity: { type: 'number', minimum: 0, maximum: 5 } },
            },
            directional: { type: 'array', items: { type: 'object' } },
            point_lights: { type: 'array', items: { type: 'object' } },
            spot_lights: { type: 'array', items: { type: 'object' } },
          },
        },
        environment: { type: 'object' },
        post_processing: { type: 'object' },
      },
    },
    entry_point: { type: 'string', pattern: '^[a-zA-Z0-9._/-]+$' },
  },
};

@Injectable()
export class TemplateManifestLoaderService {
  private readonly logger = new Logger(TemplateManifestLoaderService.name);
  private readonly cache: LoadedManifestCache = new Map();
  private readonly templatesDir: string;
  private readonly ajv: Ajv;
  private readonly validateManifest: ReturnType<Ajv['compile']>;

  constructor(private readonly configService: ConfigService) {
    this.templatesDir = this.resolveTemplatesDir();
    this.ajv = new Ajv({ allErrors: true });
    this.validateManifest = this.ajv.compile(MANIFEST_SCHEMA);
    this.logger.log(`Template manifests directory: ${this.templatesDir}`);
  }

  private resolveTemplatesDir(): string {
    const configured = this.configService.get<string>('GAME_TEMPLATES_DIR');
    if (configured) {
      return configured;
    }
    return path.resolve(__dirname, '..', '..', '..', '..', '..', 'templates', 'games');
  }

  private buildCacheKey(templateId: string, version: string): string {
    return `${templateId}@${version}`;
  }

  loadManifest(templateId: string, version?: string): TemplateLoadResult {
    if (templateId.includes('..') || path.isAbsolute(templateId)) {
      throw new Error(`Invalid template_id: ${templateId}`);
    }
    const manifestPath = path.resolve(this.templatesDir, templateId, 'manifest.yaml');
    if (!manifestPath.startsWith(path.resolve(this.templatesDir) + path.sep)) {
      throw new Error(`Template path escapes templates directory: ${templateId}`);
    }

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Template manifest not found: ${manifestPath}`);
    }

    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as TemplateManifest;

    const isValid = this.validateManifest(manifest);
    if (!isValid) {
      const errors = this.validateManifest.errors?.map((e) => `${e.instancePath} ${e.message}`).join('; ') || 'Unknown validation error';
      throw new Error(`Invalid template manifest for ${templateId}: ${errors}`);
    }

    const resolvedVersion = version || manifest.version;
    const cacheKey = this.buildCacheKey(templateId, resolvedVersion);
    this.cache.set(cacheKey, manifest);

    this.logger.debug(`Loaded template manifest: ${cacheKey} from ${manifestPath}`);

    return { manifest, loaded_from: manifestPath };
  }

  getManifest(templateId: string, version?: string): TemplateManifest | undefined {
    if (version) {
      return this.cache.get(this.buildCacheKey(templateId, version));
    }

    for (const [key, manifest] of this.cache.entries()) {
      if (key.startsWith(`${templateId}@`)) {
        return manifest;
      }
    }
    return undefined;
  }

  listTemplates(): string[] {
    if (!fs.existsSync(this.templatesDir)) {
      return [];
    }

    return fs
      .readdirSync(this.templatesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(this.templatesDir, entry.name, 'manifest.yaml')))
      .map((entry) => entry.name);
  }

  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Template manifest cache cleared');
  }
}
