import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Brand asset reference for campaign planning
 */
export class BrandAssetRef {
  @IsString()
  @IsNotEmpty()
  uri: string;

  @IsString()
  @IsNotEmpty()
  type: 'logo' | 'color_palette' | 'font' | 'image' | 'video' | 'audio' | 'other';

  @IsString()
  @IsOptional()
  description?: string;
}

/**
 * Constraints for campaign generation
 */
export class CampaignConstraints {
  @IsNumber()
  @Min(5)
  @Max(120)
  @IsOptional()
  max_game_duration_sec?: number;

  @IsString()
  @IsOptional()
  target_audience?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  excluded_themes?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  required_features?: string[];

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  region?: string;
}

/**
 * Input DTO for campaign_plan_from_brief skill
 */
export class CampaignPlanFromBriefInput {
  @IsString()
  @IsNotEmpty()
  brief: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BrandAssetRef)
  @IsOptional()
  brand_assets?: BrandAssetRef[];

  @ValidateNested()
  @Type(() => CampaignConstraints)
  @IsOptional()
  constraints?: CampaignConstraints;

  @IsString()
  @IsOptional()
  provider?: string;
}

/**
 * Video prompt for campaign intro/outcome videos
 */
export interface VideoPrompt {
  type: 'intro' | 'win' | 'lose';
  prompt: string;
  style_notes: string;
  duration_sec: number;
}

/**
 * Required asset specification
 */
export interface RequiredAsset {
  asset_type: 'image' | 'video' | 'audio' | '3d_model' | 'sfx';
  description: string;
  specifications: Record<string, unknown>;
}

/**
 * Output DTO for campaign_plan_from_brief skill
 */
export interface CampaignPlanOutput {
  /** Campaign theme (e.g., "summer beach vibes", "retro arcade") */
  theme: string;

  /** Tone of the campaign (e.g., "playful", "professional", "energetic") */
  tone: string;

  /** Color scheme derived from brand or generated */
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };

  /** Selected game template */
  game_template: {
    template_id: string;
    template_name: string;
    rationale: string;
  };

  /** Suggested difficulty settings */
  difficulty: {
    level: 'easy' | 'medium' | 'hard';
    win_probability: number;
    rationale: string;
  };

  /** Required assets to generate */
  required_assets: RequiredAsset[];

  /** Video prompts for intro and outcomes */
  video_prompts: VideoPrompt[];

  /** Audio specifications */
  audio_specs: {
    bgm_style: string;
    bgm_bpm: number;
    sfx_list: string[];
  };

  /** Copy/text content */
  copy: {
    intro_headline: string;
    intro_subtext: string;
    win_message: string;
    lose_message: string;
    cta_text: string;
  };

  /** Planning metadata */
  planning_notes: string;
}
