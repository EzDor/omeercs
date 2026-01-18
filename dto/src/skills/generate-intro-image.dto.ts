import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Supported image styles
 */
export type ImageStyle = 'photorealistic' | 'illustrated' | 'cartoon' | '3d_render' | 'flat_design' | 'minimalist';

/**
 * Image aspect ratios
 */
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

/**
 * Brand asset reference for intro image generation
 */
export class IntroImageBrandAssetRef {
  @IsString()
  @IsNotEmpty()
  uri: string;

  @IsString()
  @IsEnum(['logo', 'color_palette', 'font', 'style_guide', 'reference_image'])
  type: 'logo' | 'color_palette' | 'font' | 'style_guide' | 'reference_image';

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  weight?: number;
}

/**
 * Style reference for image generation
 */
export class StyleRef {
  @IsString()
  @IsOptional()
  reference_image_uri?: string;

  @IsString()
  @IsEnum(['photorealistic', 'illustrated', 'cartoon', '3d_render', 'flat_design', 'minimalist'])
  @IsOptional()
  style?: ImageStyle;

  @IsString()
  @IsOptional()
  mood?: string;

  @IsString()
  @IsOptional()
  color_tone?: string;
}

/**
 * Image specifications
 */
export class ImageSpecs {
  @IsNumber()
  @IsOptional()
  @Min(256)
  @Max(4096)
  width?: number;

  @IsNumber()
  @IsOptional()
  @Min(256)
  @Max(4096)
  height?: number;

  @IsString()
  @IsEnum(['1:1', '16:9', '9:16', '4:3', '3:4'])
  @IsOptional()
  aspect_ratio?: AspectRatio;

  @IsString()
  @IsEnum(['png', 'jpg', 'webp'])
  @IsOptional()
  format?: 'png' | 'jpg' | 'webp';

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  quality?: number;
}

/**
 * Input DTO for generate_intro_image skill
 */
export class GenerateIntroImageInput {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntroImageBrandAssetRef)
  @IsOptional()
  brand_assets?: IntroImageBrandAssetRef[];

  @ValidateNested()
  @Type(() => StyleRef)
  @IsOptional()
  style_refs?: StyleRef;

  @ValidateNested()
  @Type(() => ImageSpecs)
  @IsOptional()
  specs?: ImageSpecs;

  @IsString()
  @IsOptional()
  negative_prompt?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(30)
  seed?: number;

  @IsString()
  @IsOptional()
  provider?: string;
}

/**
 * Output DTO for generate_intro_image skill
 */
export interface GenerateIntroImageOutput {
  image_uri: string;
  width: number;
  height: number;
  format: string;
  file_size_bytes: number;
  generation_params: {
    prompt: string;
    negative_prompt?: string;
    seed?: number;
    model: string;
  };
}
