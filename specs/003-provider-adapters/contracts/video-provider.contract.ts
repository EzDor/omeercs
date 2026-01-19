/**
 * Video Provider Contract
 *
 * This file defines the contract for VideoProviderAdapter implementations.
 * Location in codebase: dto/src/providers/interfaces/video-provider.interface.ts
 *
 * @module dto/providers
 */

import { ProviderMetadata } from './image-provider.contract';

// =============================================================================
// Video-Specific Types
// =============================================================================

/**
 * Parameters for video generation requests.
 *
 * @example
 * ```typescript
 * const params: VideoGenerationParams = {
 *   prompt: 'A drone shot flying over a futuristic city',
 *   durationSec: 5,
 *   resolution: '1920x1080',
 *   fps: 30,
 * };
 * ```
 */
export interface VideoGenerationParams {
  /** Primary text prompt describing desired video (required) */
  prompt: string;

  /** Desired video duration in seconds (required) */
  durationSec: number;

  /** Text describing what to avoid in generation */
  negativePrompt?: string;

  /** Output format (e.g., 'mp4', 'webm') */
  format?: string;

  /** Resolution string (e.g., '1920x1080', '1280x720') */
  resolution?: string;

  /** Frame rate (e.g., 24, 30, 60) */
  fps?: number;

  /** Video codec (e.g., 'h264', 'h265') */
  codec?: string;

  /** Input URIs for image-to-video or video extension */
  inputUris?: string[];

  /** Motion amount/style (provider-specific) */
  motion?: string;

  /** Seed for deterministic generation */
  seed?: number;

  /** Brand asset URIs for style reference */
  brandAssets?: string[];
}

/**
 * Video-specific metadata returned with generation result.
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

  /** File size in bytes (if available) */
  fileSizeBytes?: number;
}

/**
 * Result of a video generation request.
 *
 * @example
 * ```typescript
 * const result: VideoGenerationResult = {
 *   uri: 'https://cdn.runway.com/generated/video123.mp4',
 *   metadata: {
 *     providerId: 'runway',
 *     model: 'gen-3',
 *     durationSec: 5,
 *     resolution: '1920x1080',
 *     fps: 30,
 *     format: 'mp4',
 *   },
 * };
 * ```
 */
export interface VideoGenerationResult {
  /** URI to generated video (provider-hosted, temporary) */
  uri: string;

  /** Normalized metadata about the generation */
  metadata: VideoGenerationMetadata;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Interface for video generation providers.
 *
 * Implementations must:
 * - Support text-to-video generation
 * - Optionally support image-to-video via inputUris
 * - Return immediately on error (no automatic retry)
 * - Normalize responses to standard format
 *
 * @example
 * ```typescript
 * @Injectable()
 * class RunwayAdapter implements VideoProviderAdapter {
 *   readonly providerId = 'runway';
 *
 *   async generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult> {
 *     // Call Runway API
 *     // Handle async generation with polling
 *     // Normalize response
 *   }
 * }
 * ```
 */
export interface VideoProviderAdapter {
  /** Unique identifier for this provider (e.g., 'runway', 'pikalabs', 'luma') */
  readonly providerId: string;

  /**
   * Generate a video from the given parameters.
   *
   * @param params - Generation parameters
   * @returns Promise resolving to generation result with URI and metadata
   * @throws ProviderError on any failure (no automatic retry)
   *
   * Error conditions:
   * - PROVIDER_UNAVAILABLE: Provider API is unreachable
   * - AUTHENTICATION_ERROR: Invalid credentials
   * - RATE_LIMITED: Too many requests
   * - GENERATION_FAILED: Provider returned an error
   * - INVALID_PARAMS: Unsupported parameters (e.g., unsupported duration)
   */
  generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult>;

  /**
   * Check if this provider supports the given parameters.
   *
   * @param params - Parameters to validate
   * @returns true if all parameters are supported, false otherwise
   */
  supportsParams?(params: VideoGenerationParams): boolean;
}

// =============================================================================
// Registry Interface
// =============================================================================

/**
 * Registry for video provider lookup.
 */
export interface VideoProviderRegistry {
  /**
   * Get a specific video provider by ID.
   *
   * @param providerId - Provider identifier (e.g., 'runway', 'pikalabs')
   * @returns The requested provider adapter
   * @throws ProviderError with PROVIDER_NOT_FOUND if not registered
   */
  getProvider(providerId: string): VideoProviderAdapter;

  /**
   * Get the default video provider.
   *
   * @returns The default provider adapter
   */
  getDefaultProvider(): VideoProviderAdapter;

  /**
   * List all registered video providers.
   *
   * @returns Array of provider IDs
   */
  listProviders(): string[];

  /**
   * Check if a provider is registered.
   *
   * @param providerId - Provider identifier to check
   * @returns true if registered, false otherwise
   */
  hasProvider(providerId: string): boolean;
}
