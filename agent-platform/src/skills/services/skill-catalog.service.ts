import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import { SkillDescriptor } from '@agentic-template/dto/src/skills/skill-descriptor.interface';
import { SkillResult } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import { ImageProviderRegistry } from '@agentic-template/common/src/providers/registries/image-provider.registry';
import { AudioProviderRegistry } from '@agentic-template/common/src/providers/registries/audio-provider.registry';
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

const REQUIRED_DESCRIPTOR_FIELDS: Array<keyof SkillDescriptor> = ['skill_id', 'version', 'title', 'input_schema', 'output_schema', 'implementation'];

export interface DescriptorValidationError {
  skillId: string;
  field: string;
  message: string;
}

export interface DescriptorValidationResult {
  valid: boolean;
  errors: DescriptorValidationError[];
}

@Injectable()
export class SkillCatalogService implements OnModuleInit {
  private readonly logger = new Logger(SkillCatalogService.name);
  private readonly catalogPath: string;
  private readonly descriptorsByVersion: Map<string, Map<string, SkillDescriptor>> = new Map();
  private readonly descriptors: Map<string, SkillDescriptor> = new Map();
  private readonly handlers: Map<string, SkillHandler> = new Map();
  private readonly validationErrors: DescriptorValidationError[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly imageProviderRegistry: ImageProviderRegistry,
    private readonly audioProviderRegistry: AudioProviderRegistry,
  ) {
    this.catalogPath = this.resolveCatalogPath();
  }

  private resolveCatalogPath(): string {
    const configuredPath = this.configService.get<string>('SKILLS_CATALOG_PATH');
    if (configuredPath) {
      return configuredPath;
    }

    const dockerPath = path.join(process.cwd(), 'skills', 'catalog');
    if (fs.existsSync(dockerPath)) {
      return dockerPath;
    }

    return path.join(process.cwd(), '..', 'skills', 'catalog');
  }

  onModuleInit(): void {
    this.loadCatalog();
    this.registerHandlers();
  }

  private loadCatalog(): void {
    try {
      const index = this.readCatalogIndex();
      if (!index) {
        return;
      }

      this.logger.log(`Loading skills catalog v${index.version} (updated: ${index.updated_at})`);
      this.loadActiveSkillsFromIndex(index);
      this.logger.log(`Loaded ${this.descriptors.size} skill descriptors`);
    } catch (error) {
      this.logger.error(`Failed to load skills catalog: ${this.extractErrorMessage(error)}`);
    }
  }

  private readCatalogIndex(): CatalogIndex | null {
    const indexPath = this.buildCatalogIndexPath();
    if (!this.fileExists(indexPath)) {
      this.logger.warn(`Skills catalog index not found at ${indexPath}`);
      return null;
    }
    return this.parseYamlFile<CatalogIndex>(indexPath);
  }

  private buildCatalogIndexPath(): string {
    return path.join(this.catalogPath, 'index.yaml');
  }

  private loadActiveSkillsFromIndex(index: CatalogIndex): void {
    index.skills.filter((entry) => this.isSkillActive(entry)).forEach((entry) => this.loadSkillDescriptor(entry.skill_id));
  }

  private isSkillActive(skillEntry: CatalogIndex['skills'][number]): boolean {
    if (skillEntry.status === 'active') {
      return true;
    }
    this.logger.debug(`Skipping non-active skill: ${skillEntry.skill_id} (${skillEntry.status})`);
    return false;
  }

  private loadSkillDescriptor(skillId: string): void {
    try {
      const descriptor = this.readDescriptorFile(skillId);
      if (!descriptor) {
        return;
      }

      if (!this.validateAndReportErrors(skillId, descriptor)) {
        return;
      }

      this.storeDescriptorByVersion(skillId, descriptor);
      this.updateLatestDescriptor(skillId);
      this.logger.debug(`Loaded skill: ${skillId} v${descriptor.version}`);
    } catch (error) {
      this.logger.error(`Failed to load skill ${skillId}: ${this.extractErrorMessage(error)}`);
    }
  }

  private readDescriptorFile(skillId: string): SkillDescriptor | null {
    const descriptorPath = this.buildDescriptorPath(skillId);
    if (!this.fileExists(descriptorPath)) {
      this.logger.warn(`Skill descriptor not found: ${descriptorPath}`);
      return null;
    }
    return this.parseYamlFile<SkillDescriptor>(descriptorPath);
  }

  private buildDescriptorPath(skillId: string): string {
    return path.join(this.catalogPath, `${skillId}.yaml`);
  }

  private fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  private parseYamlFile<T>(filePath: string): T {
    const content = fs.readFileSync(filePath, 'utf-8');
    return yaml.load(content) as T;
  }

  private validateAndReportErrors(skillId: string, descriptor: SkillDescriptor): boolean {
    const validation = this.validateDescriptor(skillId, descriptor);
    if (validation.valid) {
      return true;
    }

    validation.errors.forEach((error) => {
      this.validationErrors.push(error);
      this.logger.error(`Invalid skill descriptor for ${skillId}: ${error.field} - ${error.message}`);
    });
    return false;
  }

  private storeDescriptorByVersion(skillId: string, descriptor: SkillDescriptor): void {
    if (!this.descriptorsByVersion.has(skillId)) {
      this.descriptorsByVersion.set(skillId, new Map());
    }
    this.descriptorsByVersion.get(skillId)!.set(descriptor.version, descriptor);
  }

  private extractErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private validateDescriptor(skillId: string, descriptor: unknown): DescriptorValidationResult {
    if (!this.isValidObject(descriptor)) {
      return { valid: false, errors: [{ skillId, field: 'descriptor', message: 'Descriptor must be an object' }] };
    }

    const desc = descriptor as Record<string, unknown>;
    const errors: DescriptorValidationError[] = [
      ...this.findMissingRequiredFields(skillId, desc),
      ...this.validateSkillIdField(skillId, desc.skill_id),
      ...this.validateVersionField(skillId, desc.version),
      ...this.validateSchemaFields(skillId, desc),
      ...this.validateImplementationField(skillId, desc),
      ...this.validateTemplateFields(skillId, desc),
    ];

    return { valid: errors.length === 0, errors };
  }

  private isValidObject(value: unknown): boolean {
    return value !== null && typeof value === 'object';
  }

  private findMissingRequiredFields(skillId: string, desc: Record<string, unknown>): DescriptorValidationError[] {
    return REQUIRED_DESCRIPTOR_FIELDS.filter((field) => desc[field] === undefined || desc[field] === null).map((field) => ({
      skillId,
      field,
      message: `Missing required field: ${field}`,
    }));
  }

  private validateSkillIdField(skillId: string, value: unknown): DescriptorValidationError[] {
    if (value === undefined) {
      return [];
    }
    if (typeof value !== 'string') {
      return [{ skillId, field: 'skill_id', message: 'skill_id must be a string' }];
    }
    if (!this.isValidSkillIdFormat(value)) {
      return [{ skillId, field: 'skill_id', message: 'skill_id must be lowercase alphanumeric with underscores, starting with a letter' }];
    }
    return [];
  }

  private isValidSkillIdFormat(skillId: string): boolean {
    return /^[a-z][a-z0-9_]*$/.test(skillId);
  }

  private validateVersionField(skillId: string, value: unknown): DescriptorValidationError[] {
    if (value === undefined) {
      return [];
    }
    if (typeof value !== 'string') {
      return [{ skillId, field: 'version', message: 'version must be a string' }];
    }
    if (!semver.valid(value)) {
      return [{ skillId, field: 'version', message: `Invalid semver version: ${value}` }];
    }
    return [];
  }

  private validateSchemaFields(skillId: string, desc: Record<string, unknown>): DescriptorValidationError[] {
    const errors: DescriptorValidationError[] = [];
    if (desc.input_schema !== undefined && !this.isValidObject(desc.input_schema)) {
      errors.push({ skillId, field: 'input_schema', message: 'input_schema must be a valid JSON Schema object' });
    }
    if (desc.output_schema !== undefined && !this.isValidObject(desc.output_schema)) {
      errors.push({ skillId, field: 'output_schema', message: 'output_schema must be a valid JSON Schema object' });
    }
    return errors;
  }

  private validateImplementationField(skillId: string, desc: Record<string, unknown>): DescriptorValidationError[] {
    if (desc.implementation === undefined) {
      return [];
    }
    if (!this.isValidObject(desc.implementation)) {
      return [{ skillId, field: 'implementation', message: 'implementation must be an object' }];
    }

    const impl = desc.implementation as Record<string, unknown>;
    const errors: DescriptorValidationError[] = [];

    if (!this.isValidImplementationType(impl.type)) {
      errors.push({ skillId, field: 'implementation.type', message: 'implementation.type must be one of: ts_function, http_call, cli_command' });
    }
    if (this.requiresHandler(desc) && !this.hasValidHandler(impl)) {
      errors.push({ skillId, field: 'implementation.handler', message: 'implementation.handler is required and must be a string' });
    }

    return errors;
  }

  private isValidImplementationType(type: unknown): boolean {
    return typeof type === 'string' && ['ts_function', 'http_call', 'cli_command'].includes(type);
  }

  private requiresHandler(desc: Record<string, unknown>): boolean {
    return desc.template_type === undefined;
  }

  private hasValidHandler(impl: Record<string, unknown>): boolean {
    return typeof impl.handler === 'string' && impl.handler.length > 0;
  }

  private validateTemplateFields(skillId: string, desc: Record<string, unknown>): DescriptorValidationError[] {
    if (desc.template_type === undefined) {
      return [];
    }

    const errors: DescriptorValidationError[] = [];

    if (!this.isValidTemplateType(desc.template_type)) {
      errors.push({ skillId, field: 'template_type', message: 'template_type must be one of: LLM_JSON_GENERATION, LLM_REVIEW' });
    }

    errors.push(...this.validateTemplateConfig(skillId, desc));

    return errors;
  }

  private isValidTemplateType(templateType: unknown): boolean {
    return typeof templateType === 'string' && ['LLM_JSON_GENERATION', 'LLM_REVIEW'].includes(templateType);
  }

  private validateTemplateConfig(skillId: string, desc: Record<string, unknown>): DescriptorValidationError[] {
    if (desc.template_config === undefined || desc.template_config === null) {
      return [{ skillId, field: 'template_config', message: 'template_config is required when template_type is set' }];
    }
    if (!this.isValidObject(desc.template_config)) {
      return [{ skillId, field: 'template_config', message: 'template_config must be an object' }];
    }

    const config = desc.template_config as Record<string, unknown>;
    return this.validateTemplateConfigFields(skillId, desc.template_type as string, config);
  }

  private validateTemplateConfigFields(skillId: string, templateType: string, config: Record<string, unknown>): DescriptorValidationError[] {
    if (templateType === 'LLM_JSON_GENERATION' && !this.hasValidStringField(config, 'prompt_id')) {
      return [{ skillId, field: 'template_config.prompt_id', message: 'prompt_id is required for LLM_JSON_GENERATION template' }];
    }
    if (templateType === 'LLM_REVIEW' && !this.hasValidStringField(config, 'rubric_id')) {
      return [{ skillId, field: 'template_config.rubric_id', message: 'rubric_id is required for LLM_REVIEW template' }];
    }
    return [];
  }

  private hasValidStringField(obj: Record<string, unknown>, field: string): boolean {
    return typeof obj[field] === 'string' && obj[field].length > 0;
  }

  private updateLatestDescriptor(skillId: string): void {
    const versions = this.descriptorsByVersion.get(skillId);
    if (!this.hasVersions(versions)) {
      this.descriptors.delete(skillId);
      return;
    }

    const latestVersion = this.findLatestVersion(versions!);
    const latestDescriptor = versions!.get(latestVersion);
    if (latestDescriptor) {
      this.descriptors.set(skillId, latestDescriptor);
    }
  }

  private hasVersions(versions: Map<string, SkillDescriptor> | undefined): boolean {
    return versions !== undefined && versions.size > 0;
  }

  private findLatestVersion(versions: Map<string, SkillDescriptor>): string {
    const sortedVersions = this.sortVersionsBySemver(Array.from(versions.keys()));
    return sortedVersions[sortedVersions.length - 1];
  }

  private sortVersionsBySemver(versions: string[]): string[] {
    return versions.sort((a, b) => this.compareSemver(a, b));
  }

  private compareSemver(versionA: string, versionB: string): number {
    const semverA = semver.coerce(versionA);
    const semverB = semver.coerce(versionB);
    if (!semverA || !semverB) return 0;
    return semver.compare(semverA, semverB);
  }

  private registerHandlers(): void {
    this.getHandlerDefinitions().forEach(({ skillId, create }) => {
      this.handlers.set(skillId, create());
    });
    this.logger.log(`Registered ${this.handlers.size} skill handlers`);
  }

  private getHandlerDefinitions(): Array<{ skillId: string; create: () => SkillHandler }> {
    return [
      { skillId: 'campaign_plan_from_brief', create: () => new CampaignPlanFromBriefHandler(this.configService) },
      { skillId: 'game_config_from_template', create: () => new GameConfigFromTemplateHandler(this.configService) },
      { skillId: 'review_asset_quality', create: () => new ReviewAssetQualityHandler(this.configService) },
      { skillId: 'generate_intro_image', create: () => new GenerateIntroImageHandler(this.configService, this.imageProviderRegistry) },
      { skillId: 'segment_start_button', create: () => new SegmentStartButtonHandler(this.configService) },
      { skillId: 'generate_intro_video_loop', create: () => new GenerateIntroVideoLoopHandler(this.configService) },
      { skillId: 'generate_outcome_video_win', create: () => new GenerateOutcomeVideoWinHandler(this.configService) },
      { skillId: 'generate_outcome_video_lose', create: () => new GenerateOutcomeVideoLoseHandler(this.configService) },
      { skillId: 'generate_bgm_track', create: () => new GenerateBgmTrackHandler(this.configService, this.audioProviderRegistry) },
      { skillId: 'generate_sfx_pack', create: () => new GenerateSfxPackHandler(this.configService) },
      { skillId: 'mix_audio_for_game', create: () => new MixAudioForGameHandler(this.configService) },
      { skillId: 'generate_3d_asset', create: () => new Generate3DAssetHandler(this.configService) },
      { skillId: 'optimize_3d_asset', create: () => new Optimize3DAssetHandler(this.configService) },
      { skillId: 'bundle_game_template', create: () => new BundleGameTemplateHandler(this.configService) },
      { skillId: 'validate_game_bundle', create: () => new ValidateGameBundleHandler(this.configService) },
      { skillId: 'assemble_campaign_manifest', create: () => new AssembleCampaignManifestHandler(this.configService) },
    ];
  }

  getDescriptor(skillId: string): SkillDescriptor | undefined {
    return this.descriptors.get(skillId);
  }

  getSkill(skillId: string, version?: string): SkillDescriptor | undefined {
    if (!version) {
      return this.descriptors.get(skillId);
    }
    return this.getSpecificVersion(skillId, version);
  }

  private getSpecificVersion(skillId: string, version: string): SkillDescriptor | undefined {
    const versions = this.descriptorsByVersion.get(skillId);
    return versions?.get(version);
  }

  getSkillVersions(skillId: string): string[] {
    const versions = this.descriptorsByVersion.get(skillId);
    if (!versions) {
      return [];
    }
    return this.sortVersionsBySemver(Array.from(versions.keys()));
  }

  getAllDescriptors(): SkillDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  getValidationErrors(): DescriptorValidationError[] {
    return [...this.validationErrors];
  }

  hasSkill(skillId: string): boolean {
    return this.descriptors.has(skillId) && this.handlers.has(skillId);
  }

  getHandler(skillId: string): SkillHandler | undefined {
    return this.handlers.get(skillId);
  }

  async executeSkill<TInput, TOutput>(skillId: string, input: TInput, context: SkillExecutionContext): Promise<SkillResult<TOutput>> {
    const descriptor = this.descriptors.get(skillId);
    if (!descriptor) {
      return this.createErrorResult<TOutput>('SKILL_NOT_FOUND', `Skill not found: ${skillId}`);
    }

    const handler = this.handlers.get(skillId);
    if (!handler) {
      return this.createErrorResult<TOutput>('HANDLER_NOT_FOUND', `Handler not registered for skill: ${skillId}`);
    }

    this.logger.log(`Executing skill ${skillId} v${descriptor.version}`);

    try {
      const result = await handler.execute(input, { ...context, skillId });
      return result as SkillResult<TOutput>;
    } catch (error) {
      return this.handleExecutionError<TOutput>(error);
    }
  }

  private createErrorResult<TOutput>(errorCode: string, errorMessage: string): SkillResult<TOutput> {
    return {
      ok: false,
      error: errorMessage,
      error_code: errorCode,
      artifacts: [],
      debug: { timings_ms: { total: 0 } },
    };
  }

  private handleExecutionError<TOutput>(error: unknown): SkillResult<TOutput> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
    this.logger.error(`Skill execution failed: ${errorMessage}`);
    return this.createErrorResult<TOutput>('EXECUTION_ERROR', errorMessage);
  }

  listSkills(): Array<{ skill_id: string; title: string; description: string; tags: string[]; available: boolean }> {
    return Array.from(this.descriptors.values()).map((descriptor) => this.toSkillListItem(descriptor));
  }

  private toSkillListItem(descriptor: SkillDescriptor): { skill_id: string; title: string; description: string; tags: string[]; available: boolean } {
    return {
      skill_id: descriptor.skill_id,
      title: descriptor.title,
      description: descriptor.description,
      tags: descriptor.tags,
      available: this.handlers.has(descriptor.skill_id),
    };
  }
}
