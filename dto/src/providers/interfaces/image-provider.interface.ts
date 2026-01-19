import { GenerationParams, GenerationResult, ProviderMetadata } from '../types';

/**
 * Parameters specific to image generation.
 */
export interface ImageGenerationParams extends GenerationParams {
  /** Image width in pixels */
  width?: number;

  /** Image height in pixels */
  height?: number;

  /** Aspect ratio (e.g., '1:1', '16:9', '9:16') - alternative to width/height */
  aspectRatio?: string;

  /** Number of images to generate */
  numImages?: number;

  /** Quality level */
  quality?: 'standard' | 'hd';

  /** Style preset (provider-specific) */
  style?: string;
}

/**
 * Image-specific metadata.
 */
export interface ImageGenerationMetadata extends ProviderMetadata {
  /** Actual width of generated image */
  width: number;

  /** Actual height of generated image */
  height: number;

  /** Image format (png, jpeg, webp) */
  format: string;

  /** Revised prompt (if provider modified it) */
  revisedPrompt?: string;

  /** Seed used (if deterministic generation supported) */
  seed?: number;
}

/**
 * Image generation result with typed metadata.
 */
export interface ImageGenerationResult extends GenerationResult {
  metadata: ImageGenerationMetadata;
}

/**
 * Interface for image generation providers.
 */
export interface ImageProviderAdapter {
  /** Unique identifier for this provider */
  readonly providerId: string;

  /**
   * Generate an image from parameters.
   * @throws ProviderError on failure (no automatic retry)
   */
  generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult>;

  /**
   * Check if provider supports the given parameters.
   * Useful for parameter validation before submission.
   */
  supportsParams?(params: ImageGenerationParams): boolean;
}
