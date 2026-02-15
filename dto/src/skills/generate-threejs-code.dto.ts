import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested, IsObject, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateManifest } from '../template-system/template-manifest.interface';

export type CodeFilePurpose = 'scene_setup' | 'game_logic' | 'asset_loader' | 'interaction' | 'animation' | 'entry';

export interface CodeFile {
  filename: string;
  purpose: CodeFilePurpose;
  content: string;
  line_count: number;
}

export class AssetMapping {
  @IsString()
  @IsNotEmpty()
  slot_id: string;

  @IsString()
  @IsNotEmpty()
  uri: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsOptional()
  format?: string;
}

export class SceneOverrides {
  @IsArray()
  @IsOptional()
  camera_position?: [number, number, number];

  @IsNumber()
  @IsOptional()
  @Min(10)
  @Max(120)
  camera_fov?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(5)
  lighting_intensity?: number;

  @IsString()
  @IsOptional()
  background_color?: string;

  @ValidateNested()
  @Type(() => PostProcessingOverrides)
  @IsOptional()
  post_processing?: PostProcessingOverrides;
}

export class PostProcessingOverrides {
  @IsBoolean()
  @IsOptional()
  bloom_enabled?: boolean;

  @IsNumber()
  @IsOptional()
  bloom_strength?: number;

  @IsBoolean()
  @IsOptional()
  dof_enabled?: boolean;
}

export class GenerateThreejsCodeInput {
  @IsString()
  @IsNotEmpty()
  template_id: string;

  @IsObject()
  @IsNotEmpty()
  template_manifest: TemplateManifest;

  @IsObject()
  @IsNotEmpty()
  game_config: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssetMapping)
  @IsOptional()
  asset_mappings?: AssetMapping[];

  @ValidateNested()
  @Type(() => SceneOverrides)
  @IsOptional()
  scene_overrides?: SceneOverrides;

  @IsString()
  @IsOptional()
  sealed_outcome_token?: string;
}

export interface GenerateThreejsCodeOutput {
  code_files: CodeFile[];
  code_dir: string;
  total_lines: number;
}
