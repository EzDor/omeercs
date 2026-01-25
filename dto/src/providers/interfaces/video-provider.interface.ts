import { GenerationParams, GenerationResult, ProviderMetadata } from '../types/generation-params.interface';

/**
 * Parameters specific to video generation.
 */
export interface VideoGenerationParams extends GenerationParams {
  /** Desired video duration in seconds (required) */
  durationSec: number;

  /** Frame rate (e.g., 24, 30, 60) */
  fps?: number;

  /** Video codec (e.g., 'h264', 'h265') */
  codec?: string;

  /** Input URIs for image-to-video or video extension */
  inputUris?: string[];

  /** Motion amount/style (provider-specific) */
  motion?: string;
}

/**
 * Video-specific metadata.
 */
export interface VideoGenerationMetadata extends ProviderMetadata {
  /** Actual duration in seconds */
  durationSec: number;

  /** Video resolution (e.g., '1920x1080') */
  resolution: string;

  /** Frame rate */
  fps: number;

  /** Video format (mp4, webm) */
  format: string;
}

/**
 * Video generation result with typed metadata.
 */
export interface VideoGenerationResult extends GenerationResult {
  metadata: VideoGenerationMetadata;
}

/**
 * Interface for video generation providers.
 */
export interface VideoProviderAdapter {
  /** Unique identifier for this provider */
  readonly providerId: string;

  /**
   * Generate a video from parameters.
   * @throws ProviderError on failure (no automatic retry)
   */
  generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult>;

  /**
   * Check if provider supports the given parameters.
   * Useful for parameter validation before submission.
   */
  supportsParams?(params: VideoGenerationParams): boolean;
}
