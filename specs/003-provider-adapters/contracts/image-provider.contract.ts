/**
 * Image Provider Contract
 *
 * This file defines the contract for ImageProviderAdapter implementations.
 * Location in codebase: dto/src/providers/interfaces/image-provider.interface.ts
 *
 * @module dto/providers
 */

// =============================================================================
// Base Types (from dto/src/providers/types/)
// =============================================================================

/**
 * Metadata returned with every generation.
 */
export interface ProviderMetadata {
  /** Identifier of the provider used (e.g., 'stability', 'dalle') */
  providerId: string;
  /** Model identifier used for generation */
  model: string;
  /** Cost of generation in USD (if available) */
  costUsd?: number;
  /** Raw provider response for debugging */
  rawResponse?: unknown;
}

// =============================================================================
// Image-Specific Types
// =============================================================================

/**
 * Parameters for image generation requests.
 *
 * @example
 * ```typescript
 * const params: ImageGenerationParams = {
 *   prompt: 'A futuristic city at sunset, cyberpunk style',
 *   negativePrompt: 'blurry, low quality, distorted',
 *   width: 1024,
 *   height: 1024,
 *   quality: 'hd',
 *   seed: 42,
 * };
 * ```
 */
export interface ImageGenerationParams {
  /** Primary text prompt describing desired image (required) */
  prompt: string;

  /** Text describing what to avoid in generation */
  negativePrompt?: string;

  /** Output format (e.g., 'png', 'jpeg', 'webp') */
  format?: string;

  /** Image width in pixels (provider-specific limits apply) */
  width?: number;

  /** Image height in pixels (provider-specific limits apply) */
  height?: number;

  /** Aspect ratio (e.g., '1:1', '16:9', '9:16') - alternative to width/height */
  aspectRatio?: string;

  /** Number of images to generate (1-10, provider-dependent) */
  numImages?: number;

  /** Quality level */
  quality?: 'standard' | 'hd';

  /** Style preset (provider-specific) */
  style?: string;

  /** Seed for deterministic generation (best effort, not all providers support) */
  seed?: number;

  /** Input image URIs for image-to-image transformations */
  inputUris?: string[];

  /** Brand asset URIs for style reference */
  brandAssets?: string[];
}

/**
 * Image-specific metadata returned with generation result.
 */
export interface ImageGenerationMetadata extends ProviderMetadata {
  /** Actual width of generated image in pixels */
  width: number;

  /** Actual height of generated image in pixels */
  height: number;

  /** Image format (png, jpeg, webp) */
  format: string;

  /** Revised prompt if provider modified the original */
  revisedPrompt?: string;

  /** Seed used for generation (if deterministic) */
  seed?: number;
}

/**
 * Result of an image generation request.
 *
 * @example
 * ```typescript
 * const result: ImageGenerationResult = {
 *   uri: 'https://cdn.stability.ai/generated/abc123.png',
 *   metadata: {
 *     providerId: 'stability',
 *     model: 'sd3.5-large',
 *     width: 1024,
 *     height: 1024,
 *     format: 'png',
 *     seed: 42,
 *   },
 * };
 * ```
 */
export interface ImageGenerationResult {
  /** URI to generated image (provider-hosted, temporary) */
  uri: string;

  /** Normalized metadata about the generation */
  metadata: ImageGenerationMetadata;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Interface for image generation providers.
 *
 * Implementations must:
 * - Return immediately on error (no automatic retry)
 * - Normalize responses to standard format
 * - Not expose vendor-specific details in public interface
 *
 * @example
 * ```typescript
 * @Injectable()
 * class StabilityAdapter implements ImageProviderAdapter {
 *   readonly providerId = 'stability';
 *
 *   async generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
 *     // Call Stability API via LiteLLM
 *     // Normalize response
 *     // Return standard format
 *   }
 * }
 * ```
 */
export interface ImageProviderAdapter {
  /** Unique identifier for this provider (e.g., 'stability', 'dalle', 'replicate') */
  readonly providerId: string;

  /**
   * Generate an image from the given parameters.
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
   * - INVALID_PARAMS: Unsupported parameters
   */
  generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult>;

  /**
   * Check if this provider supports the given parameters.
   * Useful for parameter validation before submission.
   *
   * @param params - Parameters to validate
   * @returns true if all parameters are supported, false otherwise
   */
  supportsParams?(params: ImageGenerationParams): boolean;
}

// =============================================================================
// Registry Interface
// =============================================================================

/**
 * Registry for image provider lookup.
 *
 * @example
 * ```typescript
 * const registry = new ImageProviderRegistry(stabilityAdapter, dalleAdapter);
 *
 * // Get specific provider
 * const stability = registry.getProvider('stability');
 *
 * // Get default provider
 * const defaultProvider = registry.getDefaultProvider();
 *
 * // Generate with registry
 * const result = await registry.getProvider('dalle').generateImage(params);
 * ```
 */
export interface ImageProviderRegistry {
  /**
   * Get a specific image provider by ID.
   *
   * @param providerId - Provider identifier (e.g., 'stability', 'dalle')
   * @returns The requested provider adapter
   * @throws ProviderError with PROVIDER_NOT_FOUND if not registered
   */
  getProvider(providerId: string): ImageProviderAdapter;

  /**
   * Get the default image provider.
   *
   * @returns The default provider adapter (typically most cost-effective)
   */
  getDefaultProvider(): ImageProviderAdapter;

  /**
   * List all registered image providers.
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
