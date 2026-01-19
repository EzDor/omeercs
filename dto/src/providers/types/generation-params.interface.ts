/**
 * Common parameters for all media generation requests.
 * Provider adapters may support a subset based on underlying API.
 */
export interface GenerationParams {
  /** Primary text prompt describing desired output */
  prompt: string;

  /** Output format (e.g., 'png', 'mp4', 'wav') */
  format?: string;

  /** Text describing what to avoid in generation */
  negativePrompt?: string;

  /** Desired duration in seconds (for video/audio) */
  durationSec?: number;

  /** Resolution string (e.g., '1024x1024', '1920x1080') */
  resolution?: string;

  /** Seed for deterministic generation (best effort) */
  seed?: number;

  /** Input media URIs (for image-to-video, style transfer, etc.) */
  inputUris?: string[];

  /** Brand asset URIs for style reference */
  brandAssets?: string[];
}

/**
 * Standard result from any provider generation call.
 * URIs point to provider-hosted content (no platform storage).
 */
export interface GenerationResult {
  /** URI to generated content (provider-hosted, temporary) */
  uri: string;

  /** Normalized metadata about the generation */
  metadata: ProviderMetadata;
}

/**
 * Metadata returned with every generation.
 * Minimum required: providerId, model.
 */
export interface ProviderMetadata {
  /** Identifier of the provider used (e.g., 'stability', 'dalle') */
  providerId: string;

  /** Model identifier used for generation */
  model: string;

  /** Duration of generated content in seconds */
  durationSec?: number;

  /** Resolution of generated content */
  resolution?: string;

  /** Cost of generation in USD (if available from provider) */
  costUsd?: number;

  /** Raw provider response for debugging (optional) */
  rawResponse?: unknown;
}
