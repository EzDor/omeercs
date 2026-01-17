import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested, Min, Max, IsEnum, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { AudioFormat, AudioSpecs } from './generate-bgm-track.dto';

/**
 * Common SFX intent types for games
 */
export type SfxIntent =
  | 'jump'
  | 'coin'
  | 'click'
  | 'win'
  | 'lose'
  | 'collect'
  | 'powerup'
  | 'explosion'
  | 'hit'
  | 'miss'
  | 'countdown'
  | 'start'
  | 'game_over'
  | 'level_up'
  | 'bonus'
  | 'notification'
  | 'error'
  | 'success'
  | 'whoosh'
  | 'pop'
  | 'ding'
  | 'buzz'
  | 'custom';

/**
 * SFX style/theme
 */
export type SfxStyle = 'retro' | 'modern' | 'cartoon' | 'realistic' | 'sci_fi' | 'fantasy' | 'arcade' | 'minimal';

/**
 * Individual SFX request
 */
export class SfxRequest {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsEnum([
    'jump',
    'coin',
    'click',
    'win',
    'lose',
    'collect',
    'powerup',
    'explosion',
    'hit',
    'miss',
    'countdown',
    'start',
    'game_over',
    'level_up',
    'bonus',
    'notification',
    'error',
    'success',
    'whoosh',
    'pop',
    'ding',
    'buzz',
    'custom',
  ])
  @IsNotEmpty()
  intent: SfxIntent;

  @IsString()
  @IsOptional()
  custom_description?: string;

  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @Max(10.0)
  duration_sec?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  variations?: number;
}

/**
 * SFX pack style configuration
 */
export class SfxPackStyle {
  @IsString()
  @IsEnum(['retro', 'modern', 'cartoon', 'realistic', 'sci_fi', 'fantasy', 'arcade', 'minimal'])
  @IsOptional()
  theme?: SfxStyle;

  @IsNumber()
  @IsOptional()
  @Min(0.0)
  @Max(1.0)
  consistency?: number;
}

/**
 * Input DTO for generate_sfx_pack skill
 */
export class GenerateSfxPackInput {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SfxRequest)
  @ArrayMinSize(1)
  @IsNotEmpty()
  sfx_list: SfxRequest[];

  @ValidateNested()
  @Type(() => SfxPackStyle)
  @IsOptional()
  style?: SfxPackStyle;

  @ValidateNested()
  @Type(() => AudioSpecs)
  @IsOptional()
  specs?: AudioSpecs;

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
 * Generated SFX file info
 */
export interface GeneratedSfx {
  name: string;
  intent: SfxIntent;
  uri: string;
  duration_sec: number;
  file_size_bytes: number;
  variation_index?: number;
}

/**
 * Output DTO for generate_sfx_pack skill
 */
export interface GenerateSfxPackOutput {
  manifest_uri: string;
  pack_uri: string;
  sfx_files: GeneratedSfx[];
  total_count: number;
  total_size_bytes: number;
  format: string;
  generation_params: {
    style_theme?: string;
    requested_sfx: string[];
    seed?: number;
    model: string;
  };
}
