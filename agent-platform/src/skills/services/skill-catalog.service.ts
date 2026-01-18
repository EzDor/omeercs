import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import { SkillDescriptor, SkillResult } from '@agentic-template/dto/src/skills';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import { CampaignPlanFromBriefHandler } from '../handlers/campaign-plan-from-brief.handler';
import { GameConfigFromTemplateHandler } from '../handlers/game-config-from-template.handler';
import { ReviewAssetQualityHandler } from '../handlers/review-asset-quality.handler';
import { GenerateIntroImageHandler } from '../handlers/generate-intro-image.handler';
import { SegmentStartButtonHandler } from '../handlers/segment-start-button.handler';
import { GenerateIntroVideoLoopHandler } from '../handlers/generate-intro-video-loop.handler';
import { GenerateOutcomeVideoWinHandler } from '../handlers/generate-outcome-video-win.handler';
import { GenerateOutcomeVideoLoseHandler } from '../handlers/generate-outcome-video-lose.handler';
import { GenerateBgmTrackHandler } from '../handlers/generate-bgm-track.handler';
import { GenerateSfxPackHandler } from '../handlers/generate-sfx-pack.handler';
import { MixAudioForGameHandler } from '../handlers/mix-audio-for-game.handler';
import { Generate3DAssetHandler } from '../handlers/generate-3d-asset.handler';
import { Optimize3DAssetHandler } from '../handlers/optimize-3d-asset.handler';
import { BundleGameTemplateHandler } from '../handlers/bundle-game-template.handler';
import { ValidateGameBundleHandler } from '../handlers/validate-game-bundle.handler';
import { AssembleCampaignManifestHandler } from '../handlers/assemble-campaign-manifest.handler';

interface CatalogIndex {
  version: string;
  updated_at: string;
  skills: Array<{
    skill_id: string;
    version: string;
    title: string;
    tags: string[];
    status: 'active' | 'deprecated' | 'experimental';
  }>;
}

/**
 * Required fields for a valid skill descriptor
 */
const REQUIRED_DESCRIPTOR_FIELDS: Array<keyof SkillDescriptor> = ['skill_id', 'version', 'title', 'input_schema', 'output_schema', 'implementation'];

/**
 * Validation error for skill descriptor loading
 */
export interface DescriptorValidationError {
  skillId: string;
  field: string;
  message: string;
}

/**
 * Result of descriptor validation
 */
export interface DescriptorValidationResult {
  valid: boolean;
  errors: DescriptorValidationError[];
}

@Injectable()
export class SkillCatalogService implements OnModuleInit {
  private readonly logger = new Logger(SkillCatalogService.name);
  private readonly catalogPath: string;
  /** Map of skill_id to Map of version to descriptor */
  private readonly descriptorsByVersion: Map<string, Map<string, SkillDescriptor>> = new Map();
  /** Map of skill_id to latest descriptor (for backward compatibility) */
  private readonly descriptors: Map<string, SkillDescriptor> = new Map();
  private readonly handlers: Map<string, SkillHandler> = new Map();
  /** Track validation errors during catalog loading */
  private readonly validationErrors: DescriptorValidationError[] = [];

  constructor(private readonly configService: ConfigService) {
    // Default to project root /skills/catalog
    this.catalogPath = configService.get<string>('SKILLS_CATALOG_PATH') || path.join(process.cwd(), '..', 'skills', 'catalog');
  }

  onModuleInit(): void {
    this.loadCatalog();
    this.registerHandlers();
  }

  /**
   * Load all skill descriptors from the catalog
   */
  private loadCatalog(): void {
    try {
      const indexPath = path.join(this.catalogPath, 'index.yaml');

      if (!fs.existsSync(indexPath)) {
        this.logger.warn(`Skills catalog index not found at ${indexPath}`);
        return;
      }

      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      const index = yaml.load(indexContent) as CatalogIndex;

      this.logger.log(`Loading skills catalog v${index.version} (updated: ${index.updated_at})`);

      for (const skillEntry of index.skills) {
        if (skillEntry.status !== 'active') {
          this.logger.debug(`Skipping non-active skill: ${skillEntry.skill_id} (${skillEntry.status})`);
          continue;
        }

        this.loadSkillDescriptor(skillEntry.skill_id);
      }

      this.logger.log(`Loaded ${this.descriptors.size} skill descriptors`);
    } catch (error) {
      this.logger.error(`Failed to load skills catalog: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load a single skill descriptor with enhanced validation
   */
  private loadSkillDescriptor(skillId: string): void {
    try {
      const descriptorPath = path.join(this.catalogPath, `${skillId}.yaml`);

      if (!fs.existsSync(descriptorPath)) {
        this.logger.warn(`Skill descriptor not found: ${descriptorPath}`);
        return;
      }

      const content = fs.readFileSync(descriptorPath, 'utf-8');
      const descriptor = yaml.load(content) as SkillDescriptor;

      // Validate required fields with detailed error reporting
      const validation = this.validateDescriptor(skillId, descriptor);
      if (!validation.valid) {
        for (const error of validation.errors) {
          this.validationErrors.push(error);
          this.logger.error(`Invalid skill descriptor for ${skillId}: ${error.field} - ${error.message}`);
        }
        return;
      }

      // Store by version
      if (!this.descriptorsByVersion.has(skillId)) {
        this.descriptorsByVersion.set(skillId, new Map());
      }
      this.descriptorsByVersion.get(skillId)!.set(descriptor.version, descriptor);

      // Update latest version in main descriptors map
      this.updateLatestDescriptor(skillId);

      this.logger.debug(`Loaded skill: ${skillId} v${descriptor.version}`);
    } catch (error) {
      this.logger.error(`Failed to load skill ${skillId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate a skill descriptor against required fields
   */
  private validateDescriptor(skillId: string, descriptor: unknown): DescriptorValidationResult {
    const errors: DescriptorValidationError[] = [];

    if (!descriptor || typeof descriptor !== 'object') {
      errors.push({ skillId, field: 'descriptor', message: 'Descriptor must be an object' });
      return { valid: false, errors };
    }

    const desc = descriptor as Record<string, unknown>;

    // Check each required field
    for (const field of REQUIRED_DESCRIPTOR_FIELDS) {
      if (desc[field] === undefined || desc[field] === null) {
        errors.push({ skillId, field, message: `Missing required field: ${field}` });
      }
    }

    // Validate skill_id format if present
    if (desc.skill_id !== undefined) {
      if (typeof desc.skill_id !== 'string') {
        errors.push({ skillId, field: 'skill_id', message: 'skill_id must be a string' });
      } else if (!/^[a-z][a-z0-9_]*$/.test(desc.skill_id)) {
        errors.push({ skillId, field: 'skill_id', message: 'skill_id must be lowercase alphanumeric with underscores, starting with a letter' });
      }
    }

    // Validate version is valid semver
    if (desc.version !== undefined) {
      if (typeof desc.version !== 'string') {
        errors.push({ skillId, field: 'version', message: 'version must be a string' });
      } else if (!semver.valid(desc.version)) {
        errors.push({ skillId, field: 'version', message: `Invalid semver version: ${desc.version}` });
      }
    }

    // Validate input_schema is an object (basic JSON Schema check)
    if (desc.input_schema !== undefined && (typeof desc.input_schema !== 'object' || desc.input_schema === null)) {
      errors.push({ skillId, field: 'input_schema', message: 'input_schema must be a valid JSON Schema object' });
    }

    // Validate output_schema is an object (basic JSON Schema check)
    if (desc.output_schema !== undefined && (typeof desc.output_schema !== 'object' || desc.output_schema === null)) {
      errors.push({ skillId, field: 'output_schema', message: 'output_schema must be a valid JSON Schema object' });
    }

    // Validate implementation structure
    if (desc.implementation !== undefined) {
      if (typeof desc.implementation !== 'object' || desc.implementation === null) {
        errors.push({ skillId, field: 'implementation', message: 'implementation must be an object' });
      } else {
        const impl = desc.implementation as Record<string, unknown>;
        if (!impl.type || !['ts_function', 'http_call', 'cli_command'].includes(impl.type as string)) {
          errors.push({ skillId, field: 'implementation.type', message: 'implementation.type must be one of: ts_function, http_call, cli_command' });
        }
        if (!impl.handler || typeof impl.handler !== 'string') {
          errors.push({ skillId, field: 'implementation.handler', message: 'implementation.handler is required and must be a string' });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Update the latest version reference for a skill
   */
  private updateLatestDescriptor(skillId: string): void {
    const versions = this.descriptorsByVersion.get(skillId);
    if (!versions || versions.size === 0) {
      this.descriptors.delete(skillId);
      return;
    }

    // Sort versions by semver and get the latest
    const sortedVersions = Array.from(versions.keys()).sort((a, b) => {
      const semverA = semver.coerce(a);
      const semverB = semver.coerce(b);
      if (!semverA || !semverB) return 0;
      return semver.compare(semverA, semverB);
    });

    const latestVersion = sortedVersions[sortedVersions.length - 1];
    const latestDescriptor = versions.get(latestVersion);
    if (latestDescriptor) {
      this.descriptors.set(skillId, latestDescriptor);
    }
  }

  /**
   * Register TypeScript handlers for skills
   */
  private registerHandlers(): void {
    // Register campaign_plan_from_brief handler
    const campaignPlanHandler = new CampaignPlanFromBriefHandler(this.configService);
    this.handlers.set('campaign_plan_from_brief', campaignPlanHandler);

    // Register game_config_from_template handler
    const gameConfigHandler = new GameConfigFromTemplateHandler(this.configService);
    this.handlers.set('game_config_from_template', gameConfigHandler);

    // Register review_asset_quality handler
    const reviewAssetHandler = new ReviewAssetQualityHandler(this.configService);
    this.handlers.set('review_asset_quality', reviewAssetHandler);

    // Register generate_intro_image handler
    const generateIntroImageHandler = new GenerateIntroImageHandler(this.configService);
    this.handlers.set('generate_intro_image', generateIntroImageHandler);

    // Register segment_start_button handler
    const segmentButtonHandler = new SegmentStartButtonHandler(this.configService);
    this.handlers.set('segment_start_button', segmentButtonHandler);

    // Register generate_intro_video_loop handler
    const introVideoLoopHandler = new GenerateIntroVideoLoopHandler(this.configService);
    this.handlers.set('generate_intro_video_loop', introVideoLoopHandler);

    // Register generate_outcome_video_win handler
    const outcomeVideoWinHandler = new GenerateOutcomeVideoWinHandler(this.configService);
    this.handlers.set('generate_outcome_video_win', outcomeVideoWinHandler);

    // Register generate_outcome_video_lose handler
    const outcomeVideoLoseHandler = new GenerateOutcomeVideoLoseHandler(this.configService);
    this.handlers.set('generate_outcome_video_lose', outcomeVideoLoseHandler);

    // Register generate_bgm_track handler
    const bgmTrackHandler = new GenerateBgmTrackHandler(this.configService);
    this.handlers.set('generate_bgm_track', bgmTrackHandler);

    // Register generate_sfx_pack handler
    const sfxPackHandler = new GenerateSfxPackHandler(this.configService);
    this.handlers.set('generate_sfx_pack', sfxPackHandler);

    // Register mix_audio_for_game handler
    const mixAudioHandler = new MixAudioForGameHandler(this.configService);
    this.handlers.set('mix_audio_for_game', mixAudioHandler);

    // Register generate_3d_asset handler
    const generate3DAssetHandler = new Generate3DAssetHandler(this.configService);
    this.handlers.set('generate_3d_asset', generate3DAssetHandler);

    // Register optimize_3d_asset handler
    const optimize3DAssetHandler = new Optimize3DAssetHandler(this.configService);
    this.handlers.set('optimize_3d_asset', optimize3DAssetHandler);

    // Register bundle_game_template handler
    const bundleGameTemplateHandler = new BundleGameTemplateHandler(this.configService);
    this.handlers.set('bundle_game_template', bundleGameTemplateHandler);

    // Register validate_game_bundle handler
    const validateGameBundleHandler = new ValidateGameBundleHandler(this.configService);
    this.handlers.set('validate_game_bundle', validateGameBundleHandler);

    // Register assemble_campaign_manifest handler
    const assembleCampaignManifestHandler = new AssembleCampaignManifestHandler(this.configService);
    this.handlers.set('assemble_campaign_manifest', assembleCampaignManifestHandler);

    this.logger.log(`Registered ${this.handlers.size} skill handlers`);
  }

  /**
   * Get a skill descriptor by ID (returns latest version)
   */
  getDescriptor(skillId: string): SkillDescriptor | undefined {
    return this.descriptors.get(skillId);
  }

  /**
   * Get a skill descriptor by ID and optional version
   * @param skillId The skill identifier
   * @param version Optional specific version (defaults to latest)
   * @returns The skill descriptor or undefined if not found
   */
  getSkill(skillId: string, version?: string): SkillDescriptor | undefined {
    if (!version) {
      // Return latest version
      return this.descriptors.get(skillId);
    }

    // Return specific version
    const versions = this.descriptorsByVersion.get(skillId);
    if (!versions) {
      return undefined;
    }

    return versions.get(version);
  }

  /**
   * Get all versions of a skill
   * @param skillId The skill identifier
   * @returns Array of version strings sorted by semver (oldest first)
   */
  getSkillVersions(skillId: string): string[] {
    const versions = this.descriptorsByVersion.get(skillId);
    if (!versions) {
      return [];
    }

    return Array.from(versions.keys()).sort((a, b) => {
      const semverA = semver.coerce(a);
      const semverB = semver.coerce(b);
      if (!semverA || !semverB) return 0;
      return semver.compare(semverA, semverB);
    });
  }

  /**
   * Get all loaded skill descriptors (latest version of each)
   */
  getAllDescriptors(): SkillDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  /**
   * Get validation errors from catalog loading
   */
  getValidationErrors(): DescriptorValidationError[] {
    return [...this.validationErrors];
  }

  /**
   * Check if a skill exists and is available
   */
  hasSkill(skillId: string): boolean {
    return this.descriptors.has(skillId) && this.handlers.has(skillId);
  }

  /**
   * Get a skill handler by ID
   */
  getHandler(skillId: string): SkillHandler | undefined {
    return this.handlers.get(skillId);
  }

  /**
   * Execute a skill with the given input
   */
  async executeSkill<TInput, TOutput>(skillId: string, input: TInput, context: SkillExecutionContext): Promise<SkillResult<TOutput>> {
    const descriptor = this.descriptors.get(skillId);
    if (!descriptor) {
      return {
        ok: false,
        error: `Skill not found: ${skillId}`,
        error_code: 'SKILL_NOT_FOUND',
        artifacts: [],
        debug: { timings_ms: { total: 0 } },
      };
    }

    const handler = this.handlers.get(skillId);
    if (!handler) {
      return {
        ok: false,
        error: `Handler not registered for skill: ${skillId}`,
        error_code: 'HANDLER_NOT_FOUND',
        artifacts: [],
        debug: { timings_ms: { total: 0 } },
      };
    }

    this.logger.log(`Executing skill ${skillId} v${descriptor.version}`);

    try {
      const result = await handler.execute(input, { ...context, skillId });
      return result as SkillResult<TOutput>;
    } catch (error) {
      this.logger.error(`Skill execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown execution error',
        error_code: 'EXECUTION_ERROR',
        artifacts: [],
        debug: { timings_ms: { total: 0 } },
      };
    }
  }

  /**
   * List all available skills with their metadata
   */
  listSkills(): Array<{ skill_id: string; title: string; description: string; tags: string[]; available: boolean }> {
    return Array.from(this.descriptors.values()).map((d) => ({
      skill_id: d.skill_id,
      title: d.title,
      description: d.description,
      tags: d.tags,
      available: this.handlers.has(d.skill_id),
    }));
  }
}
