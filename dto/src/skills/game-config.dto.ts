import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Supported game template types
 */
export type GameTemplateId = 'spin_wheel' | 'scratch_card' | 'slot_machine' | 'memory_match' | 'catch_game' | 'quiz';

/**
 * Asset reference for game configuration
 */
export class GameAssetRef {
  @IsString()
  @IsNotEmpty()
  uri: string;

  @IsString()
  @IsEnum(['background', 'sprite', 'icon', 'audio', 'model'])
  type: 'background' | 'sprite' | 'icon' | 'audio' | 'model';

  @IsString()
  @IsOptional()
  slot?: string;
}

/**
 * Difficulty settings for game
 */
export class GameDifficulty {
  @IsString()
  @IsEnum(['easy', 'medium', 'hard'])
  level: 'easy' | 'medium' | 'hard';

  @IsNumber()
  @Min(0)
  @Max(1)
  win_probability: number;
}

/**
 * Color scheme for game visuals
 */
export class GameColorScheme {
  @IsString()
  @IsOptional()
  primary?: string;

  @IsString()
  @IsOptional()
  secondary?: string;

  @IsString()
  @IsOptional()
  accent?: string;

  @IsString()
  @IsOptional()
  background?: string;
}

/**
 * Copy/text content for game
 */
export class GameCopy {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @IsString()
  @IsOptional()
  win_message?: string;

  @IsString()
  @IsOptional()
  lose_message?: string;
}

/**
 * Input DTO for game_config_from_template skill
 */
export class GameConfigFromTemplateInput {
  @IsString()
  @IsEnum(['spin_wheel', 'scratch_card', 'slot_machine', 'memory_match', 'catch_game', 'quiz'])
  template_id: GameTemplateId;

  @IsString()
  @IsNotEmpty()
  theme: string;

  @ValidateNested()
  @Type(() => GameDifficulty)
  difficulty: GameDifficulty;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GameAssetRef)
  @IsOptional()
  asset_refs?: GameAssetRef[];

  @ValidateNested()
  @Type(() => GameColorScheme)
  @IsOptional()
  color_scheme?: GameColorScheme;

  @ValidateNested()
  @Type(() => GameCopy)
  @IsOptional()
  copy?: GameCopy;

  @IsString()
  @IsOptional()
  provider?: string;
}

/**
 * Game settings in output config
 */
export interface GameConfigSettings {
  duration_sec: number;
  difficulty: {
    level: 'easy' | 'medium' | 'hard';
    win_probability: number;
    parameters: Record<string, unknown>;
  };
  locale: string;
}

/**
 * Visual configuration in output
 */
export interface GameConfigVisuals {
  theme: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  assets: Record<string, { uri: string; type: string }>;
  animations: Record<string, { type: string; duration_ms: number; easing: string }>;
}

/**
 * Audio configuration in output
 */
export interface GameConfigAudio {
  bgm: {
    enabled: boolean;
    volume: number;
    loop: boolean;
  };
  sfx: Record<string, { enabled: boolean; volume: number }>;
}

/**
 * Template-specific mechanics configuration
 */
export interface GameConfigMechanics {
  [key: string]: unknown;
}

/**
 * Output DTO for game_config_from_template skill
 */
export interface GameConfigOutput {
  template_id: GameTemplateId;
  version: string;
  settings: GameConfigSettings;
  visuals: GameConfigVisuals;
  audio: GameConfigAudio;
  mechanics: GameConfigMechanics;
  copy: {
    title: string;
    instructions: string;
    win_message: string;
    lose_message: string;
  };
}
