import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsBoolean } from 'class-validator';

/**
 * Detection method for button segmentation
 */
export type DetectionMethod = 'auto' | 'edge_detection' | 'semantic_segmentation' | 'object_detection';

/**
 * Input DTO for segment_start_button skill
 */
export class SegmentStartButtonInput {
  @IsString()
  @IsNotEmpty()
  image_uri: string;

  @IsString()
  @IsOptional()
  button_hint?: string;

  @IsString()
  @IsOptional()
  detection_method?: DetectionMethod;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  confidence_threshold?: number;

  @IsBoolean()
  @IsOptional()
  generate_mask?: boolean;

  @IsString()
  @IsOptional()
  provider?: string;
}

/**
 * Point coordinates
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Bounding box for button detection
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Mask polygon for button shape
 */
export interface MaskPolygon {
  points: Point[];
  is_closed: boolean;
}

/**
 * Output DTO for segment_start_button skill
 */
export interface SegmentStartButtonOutput {
  detected: boolean;
  confidence: number;
  bounds: BoundingBox;
  mask_polygon: MaskPolygon;
  mask_image_uri?: string;
  button_type?: 'play' | 'start' | 'cta' | 'unknown';
  detection_method_used: DetectionMethod;
  analysis_notes?: string;
}
