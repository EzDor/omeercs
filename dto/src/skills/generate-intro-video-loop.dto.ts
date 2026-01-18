import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, ValidateNested, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Motion type for intro video loop
 */
export type IntroMotionType = 'pan' | 'zoom' | 'rotate' | 'parallax' | 'subtle_movement' | 'breathing';

/**
 * Motion direction
 */
export type MotionDirection = 'left' | 'right' | 'up' | 'down' | 'in' | 'out' | 'clockwise' | 'counterclockwise';

/**
 * Motion parameters for intro video loop
 */
export class IntroMotionParams {
  @IsString()
  @IsEnum(['pan', 'zoom', 'rotate', 'parallax', 'subtle_movement', 'breathing'])
  @IsOptional()
  motion_type?: IntroMotionType;

  @IsString()
  @IsEnum(['left', 'right', 'up', 'down', 'in', 'out', 'clockwise', 'counterclockwise'])
  @IsOptional()
  direction?: MotionDirection;

  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @Max(1.0)
  intensity?: number;

  @IsNumber()
  @IsOptional()
  @Min(0.5)
  @Max(10.0)
  speed?: number;
}

/**
 * Loop configuration for seamless looping
 */
export class LoopConfig {
  @IsBoolean()
  @IsOptional()
  seamless?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @Max(1.0)
  crossfade_duration?: number;

  @IsString()
  @IsEnum(['linear', 'ease_in', 'ease_out', 'ease_in_out'])
  @IsOptional()
  easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
}

/**
 * Video specifications for output
 */
export class IntroVideoSpecs {
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
 * Input DTO for generate_intro_video_loop skill
 */
export class GenerateIntroVideoLoopInput {
  @IsString()
  @IsNotEmpty()
  image_uri: string;

  @ValidateNested()
  @Type(() => IntroMotionParams)
  @IsOptional()
  motion_params?: IntroMotionParams;

  @ValidateNested()
  @Type(() => LoopConfig)
  @IsOptional()
  loop_config?: LoopConfig;

  @ValidateNested()
  @Type(() => IntroVideoSpecs)
  @IsOptional()
  specs?: IntroVideoSpecs;

  @IsString()
  @IsOptional()
  motion_prompt?: string;

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
 * Output DTO for generate_intro_video_loop skill
 */
export interface GenerateIntroVideoLoopOutput {
  video_uri: string;
  duration_sec: number;
  width: number;
  height: number;
  fps: number;
  format: string;
  codec: string;
  file_size_bytes: number;
  is_loopable: boolean;
  generation_params: {
    source_image_uri: string;
    motion_type?: string;
    motion_prompt?: string;
    seed?: number;
    model: string;
  };
}
