import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, ValidateNested, Min, Max, IsEnum, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 3D model output format
 */
export type Model3DFormat = 'glb' | 'gltf' | 'obj' | 'fbx' | 'usdz';

/**
 * 3D style/theme for generation
 */
export type Model3DStyle =
  | 'realistic'
  | 'stylized'
  | 'low_poly'
  | 'cartoon'
  | 'anime'
  | 'voxel'
  | 'hand_painted'
  | 'sci_fi'
  | 'fantasy'
  | 'modern'
  | 'retro'
  | 'minimalist';

/**
 * Texture resolution options
 */
export type TextureResolution = '256' | '512' | '1024' | '2048' | '4096';

/**
 * 3D asset category
 */
export type AssetCategory =
  | 'character'
  | 'prop'
  | 'environment'
  | 'vehicle'
  | 'weapon'
  | 'furniture'
  | 'food'
  | 'plant'
  | 'animal'
  | 'architecture'
  | 'ui_element'
  | 'other';

/**
 * Style configuration for 3D generation
 */
export class Model3DStyleConfig {
  @IsString()
  @IsEnum(['realistic', 'stylized', 'low_poly', 'cartoon', 'anime', 'voxel', 'hand_painted', 'sci_fi', 'fantasy', 'modern', 'retro', 'minimalist'])
  @IsNotEmpty()
  theme: Model3DStyle;

  @IsString()
  @IsEnum(['character', 'prop', 'environment', 'vehicle', 'weapon', 'furniture', 'food', 'plant', 'animal', 'architecture', 'ui_element', 'other'])
  @IsOptional()
  category?: AssetCategory;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  color_palette?: string[];

  @IsString()
  @IsOptional()
  material_style?: string;

  @IsBoolean()
  @IsOptional()
  generate_textures?: boolean;

  @IsString()
  @IsEnum(['256', '512', '1024', '2048', '4096'])
  @IsOptional()
  texture_resolution?: TextureResolution;
}

/**
 * Polygon/geometry constraints
 */
export class PolyBudget {
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

  @IsString()
  @IsEnum(['mobile', 'web', 'desktop', 'vr', 'cinematic'])
  @IsOptional()
  target_platform?: 'mobile' | 'web' | 'desktop' | 'vr' | 'cinematic';
}

/**
 * Output specifications for 3D model
 */
export class Model3DSpecs {
  @IsString()
  @IsEnum(['glb', 'gltf', 'obj', 'fbx', 'usdz'])
  @IsOptional()
  format?: Model3DFormat;

  @IsBoolean()
  @IsOptional()
  embed_textures?: boolean;

  @IsBoolean()
  @IsOptional()
  generate_lods?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(5)
  lod_count?: number;

  @IsBoolean()
  @IsOptional()
  generate_collision?: boolean;

  @IsBoolean()
  @IsOptional()
  center_origin?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0.001)
  @Max(1000)
  scale?: number;
}

/**
 * Input DTO for generate_3d_asset skill
 */
export class Generate3DAssetInput {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ValidateNested()
  @Type(() => Model3DStyleConfig)
  @IsNotEmpty()
  style: Model3DStyleConfig;

  @ValidateNested()
  @Type(() => PolyBudget)
  @IsOptional()
  poly_budget?: PolyBudget;

  @ValidateNested()
  @Type(() => Model3DSpecs)
  @IsOptional()
  specs?: Model3DSpecs;

  @IsString()
  @IsOptional()
  reference_image_uri?: string;

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
 * Output DTO for generate_3d_asset skill
 */
export interface Generate3DAssetOutput {
  model_uri: string;
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
    uris?: string[];
  };
  lods?: {
    count: number;
    uris: string[];
  };
  bounding_box: {
    width: number;
    height: number;
    depth: number;
  };
  generation_params: {
    prompt: string;
    style: Model3DStyle;
    category?: string;
    poly_budget?: {
      max_triangles?: number;
      target_platform?: string;
    };
    seed?: number;
    model: string;
  };
}
