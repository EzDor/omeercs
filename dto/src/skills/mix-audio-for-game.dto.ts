import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { AudioSpecs } from './generate-bgm-track.dto';

/**
 * Loudness standard for audio normalization
 */
export type LoudnessStandard = 'lufs_16' | 'lufs_14' | 'lufs_12' | 'web_standard' | 'broadcast' | 'game_mobile' | 'game_desktop';

/**
 * Loudness targets configuration
 */
export class LoudnessTargets {
  @IsString()
  @IsEnum(['lufs_16', 'lufs_14', 'lufs_12', 'web_standard', 'broadcast', 'game_mobile', 'game_desktop'])
  @IsOptional()
  standard?: LoudnessStandard;

  @IsNumber()
  @IsOptional()
  @Min(-30)
  @Max(0)
  bgm_lufs?: number;

  @IsNumber()
  @IsOptional()
  @Min(-30)
  @Max(0)
  sfx_lufs?: number;

  @IsNumber()
  @IsOptional()
  @Min(-6)
  @Max(0)
  true_peak_dbfs?: number;

  @IsNumber()
  @IsOptional()
  @Min(0.0)
  @Max(1.0)
  bgm_to_sfx_ratio?: number;
}

/**
 * SFX manifest reference
 */
export class SfxManifestRef {
  @IsString()
  @IsNotEmpty()
  manifest_uri: string;

  @IsString()
  @IsOptional()
  pack_uri?: string;
}

/**
 * Individual SFX file reference (alternative to manifest)
 */
export class SfxFileRef {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  uri: string;

  @IsNumber()
  @IsOptional()
  @Min(-20)
  @Max(20)
  volume_adjust_db?: number;
}

/**
 * Input DTO for mix_audio_for_game skill
 */
export class MixAudioForGameInput {
  @IsString()
  @IsNotEmpty()
  bgm_uri: string;

  @ValidateNested()
  @Type(() => SfxManifestRef)
  @IsOptional()
  sfx_manifest?: SfxManifestRef;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SfxFileRef)
  @IsOptional()
  sfx_files?: SfxFileRef[];

  @ValidateNested()
  @Type(() => LoudnessTargets)
  @IsNotEmpty()
  loudness_targets: LoudnessTargets;

  @ValidateNested()
  @Type(() => AudioSpecs)
  @IsOptional()
  output_specs?: AudioSpecs;

  @IsString()
  @IsOptional()
  provider?: string;
}

/**
 * Normalized audio file info
 */
export interface NormalizedAudioFile {
  name: string;
  original_uri: string;
  normalized_uri: string;
  type: 'bgm' | 'sfx';
  original_lufs?: number;
  normalized_lufs?: number;
  peak_dbfs?: number;
  duration_sec: number;
  file_size_bytes: number;
}

/**
 * Output DTO for mix_audio_for_game skill
 */
export interface MixAudioForGameOutput {
  manifest_uri: string;
  output_dir: string;
  bgm: NormalizedAudioFile;
  sfx_files: NormalizedAudioFile[];
  total_files: number;
  total_size_bytes: number;
  loudness_info: {
    standard_used: string;
    bgm_target_lufs: number;
    sfx_target_lufs: number;
    true_peak_dbfs: number;
  };
  processing_params: {
    source_bgm_uri: string;
    source_sfx_count: number;
    provider?: string;
  };
}
