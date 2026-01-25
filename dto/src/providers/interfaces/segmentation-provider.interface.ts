import { ProviderMetadata } from '../types/generation-params.interface';

/**
 * Parameters specific to image segmentation.
 */
export interface SegmentationParams {
  /** Input image URI to segment */
  inputUri: string;

  /** Segmentation mode */
  mode?: 'semantic' | 'instance' | 'panoptic';

  /** Object types to detect (if supported) */
  objectTypes?: string[];

  /** Minimum confidence threshold (0-1) */
  confidenceThreshold?: number;

  /** Maximum number of segments to return */
  maxSegments?: number;
}

/**
 * Bounding box coordinates.
 */
export interface BoundingBox {
  /** X coordinate of top-left corner */
  x: number;

  /** Y coordinate of top-left corner */
  y: number;

  /** Width of bounding box */
  width: number;

  /** Height of bounding box */
  height: number;
}

/**
 * Individual segment result.
 */
export interface Segment {
  /** Segment identifier */
  id: string;

  /** Object label/class */
  label: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** URI to mask image */
  maskUri: string;

  /** Bounding box coordinates */
  bounds: BoundingBox;
}

/**
 * Segmentation-specific metadata.
 */
export interface SegmentationMetadata extends ProviderMetadata {
  /** Input image dimensions */
  inputResolution: string;

  /** Number of segments found */
  segmentCount: number;

  /** Segmentation mode used */
  mode: string;
}

/**
 * Segmentation result.
 */
export interface SegmentationResult {
  /** Array of detected segments */
  segments: Segment[];

  /** Normalized metadata */
  metadata: SegmentationMetadata;
}

/**
 * Interface for segmentation providers.
 */
export interface SegmentationProviderAdapter {
  /** Unique identifier for this provider */
  readonly providerId: string;

  /**
   * Segment an image into regions.
   * @throws ProviderError on failure (no automatic retry)
   */
  segment(params: SegmentationParams): Promise<SegmentationResult>;

  /**
   * Check if provider supports the given parameters.
   * Useful for parameter validation before submission.
   */
  supportsParams?(params: SegmentationParams): boolean;
}
