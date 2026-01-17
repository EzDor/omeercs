import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Outcome type for the video
 */
export type OutcomeType = 'win' | 'lose';

/**
 * Asset reference for outcome videos
 */
export class OutcomeAssetRef {
  @IsString()
  @IsNotEmpty()
  uri: string;

  @IsString()
  @IsEnum(['background', 'overlay', 'logo', 'mascot', 'confetti', 'particle_effect'])
  type: 'background' | 'overlay' | 'logo' | 'mascot' | 'confetti' | 'particle_effect';

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  opacity?: number;
}

/**
 * Theme configuration for outcome videos
 */
export class OutcomeTheme {
  @IsString()
  @IsOptional()
  primary_color?: string;

  @IsString()
  @IsOptional()
  secondary_color?: string;

  @IsString()
  @IsOptional()
  accent_color?: string;

  @IsString()
  @IsEnum(['energetic', 'calm', 'exciting', 'celebratory', 'sympathetic', 'encouraging'])
  @IsOptional()
  mood?: 'energetic' | 'calm' | 'exciting' | 'celebratory' | 'sympathetic' | 'encouraging';

  @IsString()
  @IsEnum(['modern', 'classic', 'playful', 'corporate', 'casual'])
  @IsOptional()
  style?: 'modern' | 'classic' | 'playful' | 'corporate' | 'casual';
}

/**
 * Text overlay configuration
 */
export class OutcomeTextOverlay {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsOptional()
  font_family?: string;

  @IsNumber()
  @IsOptional()
  @Min(12)
  @Max(200)
  font_size?: number;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsEnum(['top', 'center', 'bottom'])
  @IsOptional()
  position?: 'top' | 'center' | 'bottom';

  @IsString()
  @IsEnum(['fade_in', 'slide_in', 'scale_in', 'bounce'])
  @IsOptional()
  animation?: 'fade_in' | 'slide_in' | 'scale_in' | 'bounce';
}

/**
 * Video specifications for outcome videos
 */
export class OutcomeVideoSpecs {
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(30)
  duration_sec?: number;

  @IsNumber()
  @IsOptional()
  @Min(15)
  @Max(60)
  fps?: number;

  @IsNumber()
  @IsOptional()
  @Min(480)
  @Max(4096)
  width?: number;

  @IsNumber()
  @IsOptional()
  @Min(480)
  @Max(4096)
  height?: number;

  @IsString()
  @IsEnum(['mp4', 'webm'])
  @IsOptional()
  format?: 'mp4' | 'webm';

  @IsString()
  @IsEnum(['h264', 'h265', 'vp9'])
  @IsOptional()
  codec?: 'h264' | 'h265' | 'vp9';

  @IsNumber()
  @IsOptional()
  @Min(500)
  @Max(50000)
  bitrate_kbps?: number;
}

/**
 * Input DTO for generate_outcome_video_win skill
 */
export class GenerateOutcomeVideoWinInput {
  @ValidateNested()
  @Type(() => OutcomeTheme)
  @IsOptional()
  theme?: OutcomeTheme;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutcomeAssetRef)
  @IsOptional()
  assets?: OutcomeAssetRef[];

  @ValidateNested()
  @Type(() => OutcomeVideoSpecs)
  @IsOptional()
  specs?: OutcomeVideoSpecs;

  @ValidateNested()
  @Type(() => OutcomeTextOverlay)
  @IsOptional()
  text_overlay?: OutcomeTextOverlay;

  @IsString()
  @IsOptional()
  win_text?: string;

  @IsString()
  @IsOptional()
  prompt?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(2147483647)
  seed?: number;

  @IsString()
  @IsOptional()
  provider?: string;
}

/**
 * Input DTO for generate_outcome_video_lose skill
 */
export class GenerateOutcomeVideoLoseInput {
  @ValidateNested()
  @Type(() => OutcomeTheme)
  @IsOptional()
  theme?: OutcomeTheme;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutcomeAssetRef)
  @IsOptional()
  assets?: OutcomeAssetRef[];

  @ValidateNested()
  @Type(() => OutcomeVideoSpecs)
  @IsOptional()
  specs?: OutcomeVideoSpecs;

  @ValidateNested()
  @Type(() => OutcomeTextOverlay)
  @IsOptional()
  text_overlay?: OutcomeTextOverlay;

  @IsString()
  @IsOptional()
  lose_text?: string;

  @IsString()
  @IsOptional()
  prompt?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(2147483647)
  seed?: number;

  @IsString()
  @IsOptional()
  provider?: string;
}

/**
 * Output DTO for outcome video skills (shared by win and lose)
 */
export interface GenerateOutcomeVideoOutput {
  video_uri: string;
  outcome_type: OutcomeType;
  duration_sec: number;
  width: number;
  height: number;
  fps: number;
  format: string;
  codec: string;
  file_size_bytes: number;
  generation_params: {
    prompt?: string;
    outcome_text: string;
    seed?: number;
    model: string;
  };
}
