import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, ValidateNested, Min, Max, IsEnum, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { Model3DFormat, TextureResolution } from './generate-3d-asset.dto';

/**
 * Optimization level preset
 */
export type OptimizationLevel = 'minimal' | 'balanced' | 'aggressive' | 'maximum';

/**
 * Target platform for optimization
 */
export type TargetPlatform = 'mobile' | 'web' | 'desktop' | 'vr' | 'console';

/**
 * Geometry optimization constraints
 */
export class GeometryConstraints {
  @IsNumber()
  @IsOptional()
  @Min(100)
  @Max(10000000)
  max_triangles?: number;

  @IsNumber()
  @IsOptional()
  @Min(100)
  @Max(5000000)
  max_vertices?: number;

  @IsNumber()
  @IsOptional()
  @Min(0.0)
  @Max(1.0)
  simplification_ratio?: number;

  @IsBoolean()
  @IsOptional()
  preserve_uv_seams?: boolean;

  @IsBoolean()
  @IsOptional()
  preserve_hard_edges?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(90)
  hard_edge_angle?: number;
}

/**
 * Texture optimization constraints
 */
export class TextureConstraints {
  @IsString()
  @IsEnum(['256', '512', '1024', '2048', '4096'])
  @IsOptional()
  max_resolution?: TextureResolution;

  @IsString()
  @IsEnum(['png', 'jpg', 'webp', 'ktx2', 'basis'])
  @IsOptional()
  format?: 'png' | 'jpg' | 'webp' | 'ktx2' | 'basis';

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  quality?: number;

  @IsBoolean()
  @IsOptional()
  generate_mipmaps?: boolean;

  @IsBoolean()
  @IsOptional()
  compress?: boolean;

  @IsBoolean()
  @IsOptional()
  atlas_textures?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(256)
  @Max(8192)
  atlas_max_size?: number;
}

/**
 * LOD (Level of Detail) generation settings
 */
export class LODSettings {
  @IsBoolean()
  @IsNotEmpty()
  generate: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(5)
  count?: number;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  reduction_ratios?: number[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  screen_coverage_thresholds?: number[];
}

/**
 * Overall optimization constraints
 */
export class OptimizationConstraints {
  @ValidateNested()
  @Type(() => GeometryConstraints)
  @IsOptional()
  geometry?: GeometryConstraints;

  @ValidateNested()
  @Type(() => TextureConstraints)
  @IsOptional()
  textures?: TextureConstraints;

  @ValidateNested()
  @Type(() => LODSettings)
  @IsOptional()
  lods?: LODSettings;

  @IsString()
  @IsEnum(['minimal', 'balanced', 'aggressive', 'maximum'])
  @IsOptional()
  optimization_level?: OptimizationLevel;

  @IsString()
  @IsEnum(['mobile', 'web', 'desktop', 'vr', 'console'])
  @IsOptional()
  target_platform?: TargetPlatform;

  @IsNumber()
  @IsOptional()
  @Min(1024)
  @Max(1073741824)
  max_file_size_bytes?: number;
}

/**
 * Output specifications
 */
export class OptimizedModelSpecs {
  @IsString()
  @IsEnum(['glb', 'gltf', 'obj', 'fbx', 'usdz'])
  @IsOptional()
  format?: Model3DFormat;

  @IsBoolean()
  @IsOptional()
  embed_textures?: boolean;

  @IsBoolean()
  @IsOptional()
  draco_compression?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10)
  draco_compression_level?: number;

  @IsBoolean()
  @IsOptional()
  meshopt_compression?: boolean;
}

/**
 * Input DTO for optimize_3d_asset skill
 */
export class Optimize3DAssetInput {
  @IsString()
  @IsNotEmpty()
  model_uri: string;

  @ValidateNested()
  @Type(() => OptimizationConstraints)
  @IsNotEmpty()
  constraints: OptimizationConstraints;

  @ValidateNested()
  @Type(() => OptimizedModelSpecs)
  @IsOptional()
  specs?: OptimizedModelSpecs;

  @IsBoolean()
  @IsOptional()
  keep_original?: boolean;

  @IsString()
  @IsOptional()
  provider?: string;
}

/**
 * Optimization metrics and comparison
 */
export interface OptimizationMetrics {
  original: {
    triangles: number;
    vertices: number;
    materials: number;
    textures_size_bytes: number;
    file_size_bytes: number;
  };
  optimized: {
    triangles: number;
    vertices: number;
    materials: number;
    textures_size_bytes: number;
    file_size_bytes: number;
  };
  reduction: {
    triangles_percent: number;
    vertices_percent: number;
    textures_size_percent: number;
    file_size_percent: number;
  };
}

/**
 * Output DTO for optimize_3d_asset skill
 */
export interface Optimize3DAssetOutput {
  optimized_model_uri: string;
  original_model_uri: string;
  format: Model3DFormat;
  file_size_bytes: number;
  geometry: {
    triangles: number;
    vertices: number;
    materials: number;
  };
  textures?: {
    count: number;
    total_size_bytes: number;
    resolution: string;
    format: string;
    compressed: boolean;
  };
  lods?: {
    count: number;
    uris: string[];
    triangle_counts: number[];
  };
  metrics: OptimizationMetrics;
  processing_params: {
    original_uri: string;
    optimization_level: string;
    target_platform?: string;
    geometry_constraints?: {
      max_triangles?: number;
      simplification_ratio?: number;
    };
    texture_constraints?: {
      max_resolution?: string;
      format?: string;
      compressed?: boolean;
    };
  };
}
