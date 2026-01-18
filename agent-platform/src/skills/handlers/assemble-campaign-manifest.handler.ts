import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssembleCampaignManifestInput,
  AssembleCampaignManifestOutput,
  CampaignManifest,
  ManifestAssetRef,
  SkillResult,
  SkillArtifact,
  skillSuccess,
  skillFailure,
} from '@agentic-template/dto/src/skills';
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

    // Yield to event loop for proper async behavior
    await Promise.resolve();

    try {
      // Create output directory
      const setupStart = Date.now();
      const manifestDir = path.join(this.outputDir, context.executionId);
      if (!fs.existsSync(manifestDir)) {
        fs.mkdirSync(manifestDir, { recursive: true });
      }
      timings['setup'] = Date.now() - setupStart;

      // Validate assets
      const validationStart = Date.now();
      const assetValidation = this.validateAssets(input);
      timings['validate_assets'] = Date.now() - validationStart;

      // Build asset references
      const assetsStart = Date.now();
      const assetRefs = this.buildAssetRefs(input);
      timings['build_asset_refs'] = Date.now() - assetsStart;

      // Build manifest
      const manifestStart = Date.now();
      const now = new Date().toISOString();
      const manifest: CampaignManifest = {
        manifest_version: MANIFEST_VERSION,
        campaign_id: input.campaign_id,
        campaign_name: input.campaign_name,
        created_at: now,
        updated_at: now,
        version: input.version || DEFAULT_CAMPAIGN_VERSION,

        assets: {
          intro_video: assetRefs.intro_video,
          win_video: assetRefs.win_video,
          lose_video: assetRefs.lose_video,
          game_bundle: assetRefs.game_bundle,
          additional: assetRefs.additional,
        },

        interaction: {
          button: {
            bounds: input.button_config.bounds,
            mask_polygon: input.button_config.mask_polygon,
            hover_effect: input.button_config.hover_effect || 'glow',
            click_sound_uri: input.button_config.click_sound_uri,
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
            input.outcome_videos.win_redirect_url || input.outcome_videos.lose_redirect_url
              ? {
                  win_url: input.outcome_videos.win_redirect_url,
                  lose_url: input.outcome_videos.lose_redirect_url,
                  delay_ms: input.outcome_videos.auto_redirect_delay_ms || 3000,
                }
              : undefined,
        },

        rules: {
          active: true,
          start_date: input.rules?.start_date,
          end_date: input.rules?.end_date,
          max_plays_per_user: input.rules?.max_plays_per_user,
          global_win_rate: input.rules?.global_win_rate,
          require_login: input.rules?.require_login || false,
          allowed_regions: input.rules?.allowed_regions,
          excluded_regions: input.rules?.excluded_regions,
          rate_limiting: input.rules?.rate_limiting,
        },

        analytics: {
          enabled: !!input.analytics,
          tracking_id: input.analytics?.tracking_id,
          events: this.buildAnalyticsEvents(input.analytics),
        },

        branding: input.branding
          ? {
              brand_name: input.branding.brand_name,
              logo_uri: input.branding.logo_uri,
              colors: {
                primary: input.branding.primary_color,
                secondary: input.branding.secondary_color,
              },
              font_family: input.branding.font_family,
            }
          : undefined,

        metadata: input.metadata || {},
        checksum: '', // Will be computed after
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
            campaign_id: input.campaign_id,
            campaign_name: input.campaign_name,
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

  private validateAssets(input: AssembleCampaignManifestInput): { allValid: boolean; missingAssets: string[]; warnings: string[] } {
    const missingAssets: string[] = [];
    const warnings: string[] = [];

    // Check intro video
    if (!this.isValidAssetUri(input.intro_video_uri)) {
      missingAssets.push(`intro_video: ${input.intro_video_uri}`);
    }

    // Check outcome videos
    if (!this.isValidAssetUri(input.outcome_videos.win_video_uri)) {
      missingAssets.push(`win_video: ${input.outcome_videos.win_video_uri}`);
    }
    if (!this.isValidAssetUri(input.outcome_videos.lose_video_uri)) {
      missingAssets.push(`lose_video: ${input.outcome_videos.lose_video_uri}`);
    }

    // Check game bundle
    if (!this.isValidAssetUri(input.game_bundle_uri)) {
      missingAssets.push(`game_bundle: ${input.game_bundle_uri}`);
    } else if (this.isLocalPath(input.game_bundle_uri)) {
      // Check for required bundle files
      const bundlePath = input.game_bundle_uri;
      const requiredFiles = ['index.html', 'game_config.json'];
      for (const file of requiredFiles) {
        const filePath = path.join(bundlePath, file);
        if (!fs.existsSync(filePath)) {
          warnings.push(`Missing required file in game bundle: ${file}`);
        }
      }
    }

    // Check optional assets
    if (input.button_config.click_sound_uri && !this.isValidAssetUri(input.button_config.click_sound_uri)) {
      warnings.push(`Click sound not found: ${input.button_config.click_sound_uri}`);
    }

    if (input.branding?.logo_uri && !this.isValidAssetUri(input.branding.logo_uri)) {
      warnings.push(`Brand logo not found: ${input.branding.logo_uri}`);
    }

    // Validate button bounds
    if (!input.button_config.bounds || input.button_config.bounds.width <= 0 || input.button_config.bounds.height <= 0) {
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
    if (input.button_config.click_sound_uri) {
      additional.push({
        uri: input.button_config.click_sound_uri,
        type: 'audio',
        size_bytes: this.getFileSize(input.button_config.click_sound_uri),
        required: false,
      });
    }

    // Add logo if present
    if (input.branding?.logo_uri) {
      additional.push({
        uri: input.branding.logo_uri,
        type: 'image',
        size_bytes: this.getFileSize(input.branding.logo_uri),
        required: false,
      });
    }

    return {
      intro_video: {
        uri: input.intro_video_uri,
        type: 'video',
        size_bytes: this.getFileSize(input.intro_video_uri),
        checksum: this.computeChecksum(input.intro_video_uri),
        required: true,
      },
      win_video: {
        uri: input.outcome_videos.win_video_uri,
        type: 'video',
        size_bytes: this.getFileSize(input.outcome_videos.win_video_uri),
        checksum: this.computeChecksum(input.outcome_videos.win_video_uri),
        required: true,
      },
      lose_video: {
        uri: input.outcome_videos.lose_video_uri,
        type: 'video',
        size_bytes: this.getFileSize(input.outcome_videos.lose_video_uri),
        checksum: this.computeChecksum(input.outcome_videos.lose_video_uri),
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
