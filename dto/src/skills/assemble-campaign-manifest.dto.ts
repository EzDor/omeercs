import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested, IsObject, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { BoundingBox, MaskPolygon } from './segment-start-button.dto';

/**
 * Button interaction configuration for intro video
 */
export class ButtonConfig {
  @IsObject()
  @IsNotEmpty()
  bounds: BoundingBox;

  @IsObject()
  @IsOptional()
  mask_polygon?: MaskPolygon;

  @IsString()
  @IsOptional()
  hover_effect?: 'glow' | 'scale' | 'pulse' | 'none';

  @IsString()
  @IsOptional()
  click_sound_uri?: string;
}

/**
 * Outcome video configuration
 */
export class OutcomeVideoConfig {
  @IsString()
  @IsNotEmpty()
  win_video_uri: string;

  @IsString()
  @IsNotEmpty()
  lose_video_uri: string;

  @IsString()
  @IsOptional()
  win_redirect_url?: string;

  @IsString()
  @IsOptional()
  lose_redirect_url?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  auto_redirect_delay_ms?: number;
}

/**
 * Campaign rules configuration
 */
export class CampaignRules {
  @IsString()
  @IsOptional()
  start_date?: string;

  @IsString()
  @IsOptional()
  end_date?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  max_plays_per_user?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  global_win_rate?: number;

  @IsBoolean()
  @IsOptional()
  require_login?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowed_regions?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  excluded_regions?: string[];

  @IsObject()
  @IsOptional()
  rate_limiting?: {
    max_requests_per_minute?: number;
    max_requests_per_hour?: number;
  };
}

/**
 * Analytics configuration
 */
export class AnalyticsConfig {
  @IsBoolean()
  @IsOptional()
  track_impressions?: boolean;

  @IsBoolean()
  @IsOptional()
  track_interactions?: boolean;

  @IsBoolean()
  @IsOptional()
  track_completions?: boolean;

  @IsString()
  @IsOptional()
  tracking_id?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  custom_events?: string[];
}

/**
 * Branding configuration
 */
export class BrandingConfig {
  @IsString()
  @IsOptional()
  brand_name?: string;

  @IsString()
  @IsOptional()
  logo_uri?: string;

  @IsString()
  @IsOptional()
  primary_color?: string;

  @IsString()
  @IsOptional()
  secondary_color?: string;

  @IsString()
  @IsOptional()
  font_family?: string;
}

/**
 * Input DTO for assemble_campaign_manifest skill
 */
export class AssembleCampaignManifestInput {
  @IsString()
  @IsNotEmpty()
  campaign_id: string;

  @IsString()
  @IsNotEmpty()
  campaign_name: string;

  @IsString()
  @IsNotEmpty()
  intro_video_uri: string;

  @ValidateNested()
  @Type(() => OutcomeVideoConfig)
  @IsNotEmpty()
  outcome_videos: OutcomeVideoConfig;

  @IsString()
  @IsNotEmpty()
  game_bundle_uri: string;

  @ValidateNested()
  @Type(() => ButtonConfig)
  @IsNotEmpty()
  button_config: ButtonConfig;

  @ValidateNested()
  @Type(() => CampaignRules)
  @IsOptional()
  rules?: CampaignRules;

  @ValidateNested()
  @Type(() => AnalyticsConfig)
  @IsOptional()
  analytics?: AnalyticsConfig;

  @ValidateNested()
  @Type(() => BrandingConfig)
  @IsOptional()
  branding?: BrandingConfig;

  @IsString()
  @IsOptional()
  version?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

/**
 * Asset reference in manifest
 */
export interface ManifestAssetRef {
  uri: string;
  type: 'video' | 'image' | 'audio' | 'bundle' | 'config';
  size_bytes?: number;
  checksum?: string;
  required: boolean;
}

/**
 * Campaign manifest structure
 */
export interface CampaignManifest {
  manifest_version: string;
  campaign_id: string;
  campaign_name: string;
  created_at: string;
  updated_at: string;
  version: string;

  assets: {
    intro_video: ManifestAssetRef;
    win_video: ManifestAssetRef;
    lose_video: ManifestAssetRef;
    game_bundle: ManifestAssetRef;
    additional: ManifestAssetRef[];
  };

  interaction: {
    button: {
      bounds: BoundingBox;
      mask_polygon?: MaskPolygon;
      hover_effect: string;
      click_sound_uri?: string;
    };
    game_container: {
      entry_point: string;
      config_path: string;
    };
  };

  flow: {
    sequence: ('intro' | 'game' | 'outcome')[];
    intro_to_game_trigger: 'button_click' | 'auto' | 'timer';
    game_to_outcome_trigger: 'game_complete' | 'timeout';
    outcome_redirect?: {
      win_url?: string;
      lose_url?: string;
      delay_ms: number;
    };
  };

  rules: {
    active: boolean;
    start_date?: string;
    end_date?: string;
    max_plays_per_user?: number;
    global_win_rate?: number;
    require_login: boolean;
    allowed_regions?: string[];
    excluded_regions?: string[];
    rate_limiting?: {
      max_requests_per_minute?: number;
      max_requests_per_hour?: number;
    };
  };

  analytics: {
    enabled: boolean;
    tracking_id?: string;
    events: string[];
  };

  branding?: {
    brand_name?: string;
    logo_uri?: string;
    colors: {
      primary?: string;
      secondary?: string;
    };
    font_family?: string;
  };

  metadata: Record<string, unknown>;
  checksum: string;
}

/**
 * Output DTO for assemble_campaign_manifest skill
 */
export interface AssembleCampaignManifestOutput {
  manifest_uri: string;
  manifest: CampaignManifest;
  validation: {
    all_assets_valid: boolean;
    missing_assets: string[];
    warnings: string[];
  };
  deployment_ready: boolean;
}
