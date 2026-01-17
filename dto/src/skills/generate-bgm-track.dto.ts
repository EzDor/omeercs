import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, ValidateNested, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Music genre/style for BGM generation
 */
export type MusicStyle =
  | 'electronic'
  | 'ambient'
  | 'orchestral'
  | 'rock'
  | 'pop'
  | 'jazz'
  | 'classical'
  | 'cinematic'
  | 'retro'
  | 'chiptune'
  | 'lofi'
  | 'upbeat'
  | 'calm'
  | 'energetic'
  | 'mysterious';

/**
 * Music mood descriptor
 */
export type MusicMood = 'happy' | 'sad' | 'tense' | 'relaxed' | 'epic' | 'playful' | 'dramatic' | 'neutral';

/**
 * Audio format for output
 */
export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'aac';

/**
 * BGM style configuration
 */
export class BgmStyle {
  @IsString()
  @IsEnum([
    'electronic',
    'ambient',
    'orchestral',
    'rock',
    'pop',
    'jazz',
    'classical',
    'cinematic',
    'retro',
    'chiptune',
    'lofi',
    'upbeat',
    'calm',
    'energetic',
    'mysterious',
  ])
  @IsNotEmpty()
  genre: MusicStyle;

  @IsString()
  @IsEnum(['happy', 'sad', 'tense', 'relaxed', 'epic', 'playful', 'dramatic', 'neutral'])
  @IsOptional()
  mood?: MusicMood;

  @IsString()
  @IsOptional()
  instruments?: string;

  @IsNumber()
  @IsOptional()
  @Min(0.0)
  @Max(1.0)
  energy_level?: number;
}

/**
 * Audio output specifications
 */
export class AudioSpecs {
  @IsString()
  @IsEnum(['mp3', 'wav', 'ogg', 'aac'])
  @IsOptional()
  format?: AudioFormat;

  @IsNumber()
  @IsOptional()
  @Min(64)
  @Max(320)
  bitrate_kbps?: number;

  @IsNumber()
  @IsOptional()
  @Min(22050)
  @Max(48000)
  sample_rate?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(2)
  channels?: number;
}

/**
 * Input DTO for generate_bgm_track skill
 */
export class GenerateBgmTrackInput {
  @ValidateNested()
  @Type(() => BgmStyle)
  @IsNotEmpty()
  style: BgmStyle;

  @IsNumber()
  @IsOptional()
  @Min(60)
  @Max(200)
  bpm?: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(5)
  @Max(300)
  duration_sec: number;

  @IsBoolean()
  @IsOptional()
  loopable?: boolean;

  @ValidateNested()
  @Type(() => AudioSpecs)
  @IsOptional()
  specs?: AudioSpecs;

  @IsString()
  @IsOptional()
  custom_prompt?: string;

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
 * Output DTO for generate_bgm_track skill
 */
export interface GenerateBgmTrackOutput {
  audio_uri: string;
  duration_sec: number;
  bpm: number;
  format: string;
  sample_rate: number;
  bitrate_kbps: number;
  channels: number;
  file_size_bytes: number;
  is_loopable: boolean;
  generation_params: {
    style: MusicStyle;
    mood?: string;
    bpm: number;
    custom_prompt?: string;
    seed?: number;
    model: string;
  };
}
