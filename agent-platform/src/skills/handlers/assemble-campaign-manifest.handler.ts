import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssembleCampaignManifestInput, AssembleCampaignManifestOutput, CampaignManifest, ManifestAssetRef } from '@agentic-template/dto/src/skills/assemble-campaign-manifest.dto';
import { SkillResult, SkillArtifact, skillSuccess, skillFailure } from '@agentic-template/dto/src/skills/skill-result.interface';
import { SkillHandler, SkillExecutionContext } from '../interfaces/skill-handler.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const MANIFEST_VERSION = '1.0.0';
const DEFAULT_CAMPAIGN_VERSION = '1.0.0';

@Injectable()
export class AssembleCampaignManifestHandler implements SkillHandler<AssembleCampaignManifestInput, AssembleCampaignManifestOutput> {
  private readonly logger = new Logger(AssembleCampaignManifestHandler.name);
  private readonly outputDir: string;

  constructor(private readonly configService: ConfigService) {
    this.outputDir = configService.get<string>('SKILLS_OUTPUT_DIR') || '/tmp/skills/output';
  }

  async execute(input: AssembleCampaignManifestInput, context: SkillExecutionContext): Promise<SkillResult<AssembleCampaignManifestOutput>> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    this.logger.log(`Executing assemble_campaign_manifest for campaign ${input.campaign_id}, tenant ${context.tenantId}, execution ${context.executionId}`);

    await Promise.resolve();

    try {
      const normalizedInput = this.normalizeInput(input);

      const setupStart = Date.now();
      const manifestDir = path.join(this.outputDir, context.executionId);
      if (!fs.existsSync(manifestDir)) {
        fs.mkdirSync(manifestDir, { recursive: true });
      }
      timings['setup'] = Date.now() - setupStart;

      const validationStart = Date.now();
      const assetValidation = this.validateAssets(normalizedInput);
      timings['validate_assets'] = Date.now() - validationStart;

      const assetsStart = Date.now();
      const assetRefs = this.buildAssetRefs(normalizedInput);
      timings['build_asset_refs'] = Date.now() - assetsStart;

      const manifestStart = Date.now();
      const now = new Date().toISOString();
      const manifest: CampaignManifest = {
        manifest_version: MANIFEST_VERSION,
        campaign_id: normalizedInput.campaign_id,
        campaign_name: normalizedInput.campaign_name,
        created_at: now,
        updated_at: now,
        version: normalizedInput.version || DEFAULT_CAMPAIGN_VERSION,

        assets: {
          intro_video: assetRefs.intro_video,
          win_video: assetRefs.win_video,
          lose_video: assetRefs.lose_video,
          game_bundle: assetRefs.game_bundle,
          additional: assetRefs.additional,
        },

        interaction: {
          button: {
            bounds: normalizedInput.button_config!.bounds,
            mask_polygon: normalizedInput.button_config!.mask_polygon,
            hover_effect: normalizedInput.button_config!.hover_effect || 'glow',
            click_sound_uri: normalizedInput.button_config!.click_sound_uri,
          },
          game_container: {
            entry_point: 'index.html',
            config_path: 'game_config.json',
          },
        },

        flow: {
          sequence: ['intro', 'game', 'outcome'],
          intro_to_game_trigger: 'button_click',
          game_to_outcome_trigger: 'game_complete',
          outcome_redirect:
            normalizedInput.outcome_videos?.win_redirect_url || normalizedInput.outcome_videos?.lose_redirect_url
              ? {
                  win_url: normalizedInput.outcome_videos.win_redirect_url,
                  lose_url: normalizedInput.outcome_videos.lose_redirect_url,
                  delay_ms: normalizedInput.outcome_videos.auto_redirect_delay_ms || 3000,
                }
              : undefined,
        },

        rules: {
          active: true,
          start_date: normalizedInput.rules?.start_date,
          end_date: normalizedInput.rules?.end_date,
          max_plays_per_user: normalizedInput.rules?.max_plays_per_user,
          global_win_rate: normalizedInput.rules?.global_win_rate,
          require_login: normalizedInput.rules?.require_login || false,
          allowed_regions: normalizedInput.rules?.allowed_regions,
          excluded_regions: normalizedInput.rules?.excluded_regions,
          rate_limiting: normalizedInput.rules?.rate_limiting,
        },

        analytics: {
          enabled: !!normalizedInput.analytics,
          tracking_id: normalizedInput.analytics?.tracking_id,
          events: this.buildAnalyticsEvents(normalizedInput.analytics),
        },

        branding: normalizedInput.branding
          ? {
              brand_name: normalizedInput.branding.brand_name,
              logo_uri: normalizedInput.branding.logo_uri,
              colors: {
                primary: normalizedInput.branding.primary_color,
                secondary: normalizedInput.branding.secondary_color,
              },
              font_family: normalizedInput.branding.font_family,
            }
          : undefined,

        metadata: normalizedInput.metadata || {},
        checksum: '',
      };

      // Compute manifest checksum
      const manifestWithoutChecksum = { ...manifest, checksum: '' };
      manifest.checksum = crypto.createHash('sha256').update(JSON.stringify(manifestWithoutChecksum)).digest('hex');

      timings['build_manifest'] = Date.now() - manifestStart;

      // Write manifest to file
      const writeStart = Date.now();
      const manifestPath = path.join(manifestDir, 'campaign_manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      timings['write_manifest'] = Date.now() - writeStart;

      // Determine deployment readiness
      const deploymentReady = assetValidation.allValid && assetValidation.missingAssets.length === 0 && assetValidation.warnings.length === 0;

      const totalTime = Date.now() - startTime;
      this.logger.log(`Campaign manifest assembled successfully in ${totalTime}ms`);

      const output: AssembleCampaignManifestOutput = {
        manifest_uri: manifestPath,
        manifest,
        validation: {
          all_assets_valid: assetValidation.allValid,
          missing_assets: assetValidation.missingAssets,
          warnings: assetValidation.warnings,
        },
        deployment_ready: deploymentReady,
      };

      const artifacts: SkillArtifact[] = [
        {
          artifact_type: 'json/campaign-manifest',
          uri: manifestPath,
          metadata: {
            campaign_id: normalizedInput.campaign_id,
            campaign_name: normalizedInput.campaign_name,
            version: manifest.version,
            deployment_ready: deploymentReady,
          },
        },
      ];

      return skillSuccess(output, artifacts, {
        timings_ms: { total: totalTime, ...timings },
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to assemble campaign manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return skillFailure(error instanceof Error ? error.message : 'Unknown error during manifest assembly', 'EXECUTION_ERROR', {
        timings_ms: { total: totalTime, ...timings },
      });
    }
  }

  private normalizeInput(input: AssembleCampaignManifestInput): AssembleCampaignManifestInput {
    const normalized = { ...input };

    if (!normalized.outcome_videos) {
      normalized.outcome_videos = {
        win_video_uri: normalized.win_video_uri || '',
        lose_video_uri: normalized.lose_video_uri || '',
      };
    }

    if (!normalized.button_config) {
      const bounds = normalized.button_bounds as { x?: number; y?: number; width?: number; height?: number } | undefined;
      normalized.button_config = {
        bounds: {
          x: bounds?.x ?? 0,
          y: bounds?.y ?? 0,
          width: bounds?.width ?? 200,
          height: bounds?.height ?? 60,
        },
        hover_effect: 'glow',
      };
    }

    if (!normalized.campaign_name) {
      const planData = normalized.plan_data as Record<string, unknown> | undefined;
      normalized.campaign_name = (planData?.theme as string) || 'Campaign';
    }

    return normalized;
  }

  private validateAssets(input: AssembleCampaignManifestInput): { allValid: boolean; missingAssets: string[]; warnings: string[] } {
    const missingAssets: string[] = [];
    const warnings: string[] = [];

    // Check intro video
    if (!this.isValidAssetUri(input.intro_video_uri)) {
      missingAssets.push(`intro_video: ${input.intro_video_uri}`);
    }

    if (!this.isValidAssetUri(input.outcome_videos?.win_video_uri || '')) {
      missingAssets.push(`win_video: ${input.outcome_videos?.win_video_uri}`);
    }
    if (!this.isValidAssetUri(input.outcome_videos?.lose_video_uri || '')) {
      missingAssets.push(`lose_video: ${input.outcome_videos?.lose_video_uri}`);
    }

    if (!this.isValidAssetUri(input.game_bundle_uri)) {
      missingAssets.push(`game_bundle: ${input.game_bundle_uri}`);
    } else if (this.isLocalPath(input.game_bundle_uri)) {
      const bundlePath = input.game_bundle_uri;
      const requiredFiles = ['index.html', 'game_config.json'];
      for (const file of requiredFiles) {
        const filePath = path.join(bundlePath, file);
        if (!fs.existsSync(filePath)) {
          warnings.push(`Missing required file in game bundle: ${file}`);
        }
      }
    }

    if (input.button_config?.click_sound_uri && !this.isValidAssetUri(input.button_config.click_sound_uri)) {
      warnings.push(`Click sound not found: ${input.button_config.click_sound_uri}`);
    }

    if (input.branding?.logo_uri && !this.isValidAssetUri(input.branding.logo_uri)) {
      warnings.push(`Brand logo not found: ${input.branding.logo_uri}`);
    }

    if (!input.button_config?.bounds || input.button_config.bounds.width <= 0 || input.button_config.bounds.height <= 0) {
      warnings.push('Invalid button bounds: width and height must be positive');
    }

    // Validate rules dates
    if (input.rules?.start_date && input.rules?.end_date) {
      const startDate = new Date(input.rules.start_date);
      const endDate = new Date(input.rules.end_date);
      if (endDate <= startDate) {
        warnings.push('Campaign end_date should be after start_date');
      }
    }

    return {
      allValid: missingAssets.length === 0,
      missingAssets,
      warnings,
    };
  }

  private isValidAssetUri(uri: string): boolean {
    if (!uri) return false;

    // Check if it's a URL
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return true; // Assume URLs are valid (would need HTTP check in production)
    }

    // Check if it's a local file/directory
    return fs.existsSync(uri);
  }

  private isLocalPath(uri: string): boolean {
    return !uri.startsWith('http://') && !uri.startsWith('https://');
  }

  private buildAssetRefs(input: AssembleCampaignManifestInput): {
    intro_video: ManifestAssetRef;
    win_video: ManifestAssetRef;
    lose_video: ManifestAssetRef;
    game_bundle: ManifestAssetRef;
    additional: ManifestAssetRef[];
  } {
    const additional: ManifestAssetRef[] = [];

    // Add click sound if present
    if (input.button_config?.click_sound_uri) {
      additional.push({
        uri: input.button_config.click_sound_uri,
        type: 'audio',
        size_bytes: this.getFileSize(input.button_config.click_sound_uri),
        required: false,
      });
    }

    if (input.branding?.logo_uri) {
      additional.push({
        uri: input.branding.logo_uri,
        type: 'image',
        size_bytes: this.getFileSize(input.branding.logo_uri),
        required: false,
      });
    }

    const winVideoUri = input.outcome_videos?.win_video_uri || '';
    const loseVideoUri = input.outcome_videos?.lose_video_uri || '';

    return {
      intro_video: {
        uri: input.intro_video_uri,
        type: 'video',
        size_bytes: this.getFileSize(input.intro_video_uri),
        checksum: this.computeChecksum(input.intro_video_uri),
        required: true,
      },
      win_video: {
        uri: winVideoUri,
        type: 'video',
        size_bytes: this.getFileSize(winVideoUri),
        checksum: this.computeChecksum(winVideoUri),
        required: true,
      },
      lose_video: {
        uri: loseVideoUri,
        type: 'video',
        size_bytes: this.getFileSize(loseVideoUri),
        checksum: this.computeChecksum(loseVideoUri),
        required: true,
      },
      game_bundle: {
        uri: input.game_bundle_uri,
        type: 'bundle',
        size_bytes: this.getDirSize(input.game_bundle_uri),
        required: true,
      },
      additional,
    };
  }

  private getFileSize(uri: string): number | undefined {
    if (!this.isLocalPath(uri)) return undefined;

    try {
      const stats = fs.statSync(uri);
      return stats.isFile() ? stats.size : undefined;
    } catch {
      return undefined;
    }
  }

  private getDirSize(uri: string): number | undefined {
    if (!this.isLocalPath(uri)) return undefined;

    try {
      const stats = fs.statSync(uri);
      if (stats.isFile()) return stats.size;

      // Calculate directory size recursively
      let totalSize = 0;
      const calculateSize = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            calculateSize(fullPath);
          } else {
            totalSize += fs.statSync(fullPath).size;
          }
        }
      };
      calculateSize(uri);
      return totalSize;
    } catch {
      return undefined;
    }
  }

  private computeChecksum(uri: string): string | undefined {
    if (!this.isLocalPath(uri)) return undefined;

    try {
      const stats = fs.statSync(uri);
      if (!stats.isFile()) return undefined;

      const content = fs.readFileSync(uri);
      return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    } catch {
      return undefined;
    }
  }

  private buildAnalyticsEvents(analytics?: AssembleCampaignManifestInput['analytics']): string[] {
    const defaultEvents = ['campaign_view', 'intro_started', 'button_clicked', 'game_started', 'game_completed', 'outcome_shown'];

    if (!analytics) return defaultEvents;

    const events = [...defaultEvents];

    if (analytics.track_impressions) {
      events.push('impression');
    }
    if (analytics.track_interactions) {
      events.push('interaction', 'hover', 'scroll');
    }
    if (analytics.track_completions) {
      events.push('win', 'lose', 'redirect');
    }
    if (analytics.custom_events) {
      events.push(...analytics.custom_events);
    }

    return [...new Set(events)]; // Remove duplicates
  }
}
