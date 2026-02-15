import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested, IsObject, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { GameTemplateId } from './game-config.dto';
import { SceneOverrides } from './generate-threejs-code.dto';

/**
 * Asset reference for bundling
 */
export class BundleAssetRef {
  @IsString()
  @IsNotEmpty()
  uri: string;

  @IsString()
  @IsNotEmpty()
  type: 'image' | 'audio' | 'video' | 'model' | 'json' | 'other';

  @IsString()
  @IsNotEmpty()
  slot: string;

  @IsString()
  @IsOptional()
  content_type?: string;
}

/**
 * Bundle optimization options
 */
export class BundleOptimizationOptions {
  @IsBoolean()
  @IsOptional()
  minify_js?: boolean;

  @IsBoolean()
  @IsOptional()
  minify_css?: boolean;

  @IsBoolean()
  @IsOptional()
  compress_images?: boolean;

  @IsBoolean()
  @IsOptional()
  generate_sourcemaps?: boolean;

  @IsBoolean()
  @IsOptional()
  tree_shake?: boolean;
}

/**
 * Bundle output format configuration
 */
export class BundleOutputConfig {
  @IsString()
  @IsOptional()
  format?: 'directory' | 'zip' | 'tar';

  @IsString()
  @IsOptional()
  base_path?: string;

  @IsBoolean()
  @IsOptional()
  include_manifest?: boolean;

  @IsBoolean()
  @IsOptional()
  include_checksums?: boolean;
}

/**
 * Input DTO for bundle_game_template skill
 */
export class BundleGameTemplateInput {
  @IsString()
  @IsNotEmpty()
  template_id: GameTemplateId;

  @IsObject()
  @IsNotEmpty()
  game_config: Record<string, unknown>;

  @IsString()
  @IsOptional()
  audio_uri?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BundleAssetRef)
  @IsOptional()
  assets?: BundleAssetRef[];

  @ValidateNested()
  @Type(() => BundleOptimizationOptions)
  @IsOptional()
  optimization?: BundleOptimizationOptions;

  @ValidateNested()
  @Type(() => BundleOutputConfig)
  @IsOptional()
  output?: BundleOutputConfig;

  @IsString()
  @IsOptional()
  version?: string;

  @ValidateNested()
  @Type(() => SceneOverrides)
  @IsOptional()
  scene_overrides?: SceneOverrides;

  @IsString()
  @IsOptional()
  sealed_outcome_token?: string;
}

/**
 * Bundled file info in output
 */
export interface BundledFileInfo {
  path: string;
  size_bytes: number;
  content_type: string;
  checksum?: string;
}

/**
 * Bundle manifest structure
 */
export interface BundleManifest {
  bundle_id: string;
  template_id: GameTemplateId;
  version: string;
  created_at: string;
  files: BundledFileInfo[];
  entry_point: string;
  assets: {
    images: string[];
    audio: string[];
    video: string[];
    models: string[];
    configs: string[];
  };
  checksum: string;
  metadata: {
    total_size_bytes: number;
    file_count: number;
    optimizations_applied: string[];
  };
}

/**
 * Output DTO for bundle_game_template skill
 */
export interface BundleGameTemplateOutput {
  bundle_uri: string;
  manifest_uri: string;
  manifest: BundleManifest;
  total_size_bytes: number;
  file_count: number;
  entry_point: string;
  optimizations_applied: string[];
}
