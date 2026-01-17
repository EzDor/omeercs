import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SkillDescriptor, SkillResult } from '@agentic-template/dto/src/skills';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import { CampaignPlanFromBriefHandler } from '../handlers/campaign-plan-from-brief.handler';
import { GameConfigFromTemplateHandler } from '../handlers/game-config-from-template.handler';
import { ReviewAssetQualityHandler } from '../handlers/review-asset-quality.handler';

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

@Injectable()
export class SkillCatalogService implements OnModuleInit {
  private readonly logger = new Logger(SkillCatalogService.name);
  private readonly catalogPath: string;
  private readonly descriptors: Map<string, SkillDescriptor> = new Map();
  private readonly handlers: Map<string, SkillHandler> = new Map();

  constructor(private readonly configService: ConfigService) {
    // Default to project root /skills/catalog
    this.catalogPath = configService.get<string>('SKILLS_CATALOG_PATH') || path.join(process.cwd(), '..', 'skills', 'catalog');
  }

  async onModuleInit(): Promise<void> {
    await this.loadCatalog();
    this.registerHandlers();
  }

  /**
   * Load all skill descriptors from the catalog
   */
  private async loadCatalog(): Promise<void> {
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

        await this.loadSkillDescriptor(skillEntry.skill_id);
      }

      this.logger.log(`Loaded ${this.descriptors.size} skill descriptors`);
    } catch (error) {
      this.logger.error(`Failed to load skills catalog: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load a single skill descriptor
   */
  private async loadSkillDescriptor(skillId: string): Promise<void> {
    try {
      const descriptorPath = path.join(this.catalogPath, `${skillId}.yaml`);

      if (!fs.existsSync(descriptorPath)) {
        this.logger.warn(`Skill descriptor not found: ${descriptorPath}`);
        return;
      }

      const content = fs.readFileSync(descriptorPath, 'utf-8');
      const descriptor = yaml.load(content) as SkillDescriptor;

      // Validate required fields
      if (!descriptor.skill_id || !descriptor.version || !descriptor.implementation) {
        this.logger.error(`Invalid skill descriptor for ${skillId}: missing required fields`);
        return;
      }

      this.descriptors.set(skillId, descriptor);
      this.logger.debug(`Loaded skill: ${skillId} v${descriptor.version}`);
    } catch (error) {
      this.logger.error(`Failed to load skill ${skillId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    this.logger.log(`Registered ${this.handlers.size} skill handlers`);
  }

  /**
   * Get a skill descriptor by ID
   */
  getDescriptor(skillId: string): SkillDescriptor | undefined {
    return this.descriptors.get(skillId);
  }

  /**
   * Get all loaded skill descriptors
   */
  getAllDescriptors(): SkillDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  /**
   * Check if a skill exists and is available
   */
  hasSkill(skillId: string): boolean {
    return this.descriptors.has(skillId) && this.handlers.has(skillId);
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
