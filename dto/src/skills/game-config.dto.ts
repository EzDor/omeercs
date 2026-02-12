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
 * Spin Wheel segment configuration
 */
export interface SpinWheelSegment {
  label: string;
  color: string;
  prize: string | null;
  weight: number;
  icon_uri?: string;
}

/**
 * Spin Wheel mechanics configuration
 */
export interface SpinWheelMechanics {
  segments: SpinWheelSegment[];
  spin_duration_ms: number;
  friction: number;
}

/**
 * Scratch Card prize position
 */
export interface ScratchCardPrize {
  position: { row: number; col: number };
  value: string;
  is_winner: boolean;
}

/**
 * Scratch Card mechanics configuration
 */
export interface ScratchCardMechanics {
  grid_size: { rows: number; cols: number };
  reveal_threshold: number;
  prizes: ScratchCardPrize[];
  scratch_particle_color: string;
}

/**
 * Slot Machine symbol configuration
 */
export interface SlotMachineSymbol {
  id: string;
  weight: number;
  asset_slot?: string;
  value: number;
}

/**
 * Slot Machine mechanics configuration
 */
export interface SlotMachineMechanics {
  reels: number;
  rows_visible: number;
  symbols: SlotMachineSymbol[];
  paylines: number[][];
  spin_duration_ms: number;
  reel_delay_ms: number;
}

/**
 * Memory Match mechanics configuration
 */
export interface MemoryMatchMechanics {
  grid: { rows: number; cols: number };
  time_limit_sec: number;
  card_flip_duration_ms: number;
  match_display_duration_ms: number;
  card_back_asset?: string;
}

/**
 * Catch Game object configuration
 */
export interface CatchGameObject {
  id: string;
  asset_slot?: string;
  points: number;
  spawn_weight: number;
  fall_speed_multiplier: number;
}

/**
 * Catch Game mechanics configuration
 */
export interface CatchGameMechanics {
  duration_sec: number;
  spawn_rate_per_sec: number;
  base_fall_speed: number;
  good_objects: CatchGameObject[];
  bad_objects: CatchGameObject[];
  win_score: number;
  basket_width_percent: number;
}

/**
 * Quiz question configuration
 */
export interface QuizQuestion {
  text: string;
  options: string[];
  correct_index: number;
  time_limit_sec: number;
  points: number;
}

/**
 * Quiz mechanics configuration
 */
export interface QuizMechanics {
  questions: QuizQuestion[];
  pass_threshold: number;
  show_correct_answer: boolean;
  shuffle_questions: boolean;
  shuffle_options: boolean;
}

/**
 * Template-specific mechanics configuration (union type)
 */
export type GameConfigMechanics =
  | SpinWheelMechanics
  | ScratchCardMechanics
  | SlotMachineMechanics
  | MemoryMatchMechanics
  | CatchGameMechanics
  | QuizMechanics
  | Record<string, unknown>;

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
