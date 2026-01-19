/**
 * 3D Asset Provider Contract
 *
 * This file defines the contract for Asset3DProviderAdapter implementations.
 * Location in codebase: dto/src/providers/interfaces/asset3d-provider.interface.ts
 *
 * @module dto/providers
 */

import { ProviderMetadata } from './image-provider.contract';

// =============================================================================
// 3D Asset-Specific Types
// =============================================================================

/**
 * Supported 3D file formats.
 */
export type Asset3DFormat = 'glb' | 'gltf' | 'obj' | 'fbx' | 'usdz' | 'stl';

/**
 * Level of detail options.
 */
export type LevelOfDetail = 'low' | 'medium' | 'high';

/**
 * Parameters for 3D asset generation requests.
 *
 * @example
 * ```typescript
 * const params: Asset3DGenerationParams = {
 *   prompt: 'A medieval sword with ornate handle',
 *   format: 'glb',
 *   lod: 'high',
 *   includeTextures: true,
 * };
 * ```
 */
export interface Asset3DGenerationParams {
  /** Primary text prompt describing desired 3D asset (required) */
  prompt: string;

  /** 3D format (required) */
  format: Asset3DFormat;

  /** Level of detail */
  lod?: LevelOfDetail;

  /** Include textures in output */
  includeTextures?: boolean;

  /** Include animations (if applicable) */
  includeAnimations?: boolean;

  /** Target polygon count (approximate) */
  polyCountTarget?: number;

  /** Text describing what to avoid */
  negativePrompt?: string;

  /** Seed for deterministic generation */
  seed?: number;

  /** Input URIs for image-to-3D conversion */
  inputUris?: string[];

  /** Brand asset URIs for style reference */
  brandAssets?: string[];
}

/**
 * 3D asset-specific metadata returned with generation result.
 */
export interface Asset3DGenerationMetadata extends ProviderMetadata {
  /** 3D format */
  format: Asset3DFormat;

  /** Actual polygon count */
  polyCount?: number;

  /** Number of materials used */
  materialCount?: number;

  /** Whether textures are included */
  hasTextures: boolean;

  /** Whether animations are included */
  hasAnimations: boolean;

  /** File size in bytes (if available) */
  fileSizeBytes?: number;

  /** Bounding box dimensions */
  boundingBox?: {
    width: number;
    height: number;
    depth: number;
  };
}

/**
 * Result of a 3D asset generation request.
 *
 * @example
 * ```typescript
 * const result: Asset3DGenerationResult = {
 *   uri: 'https://cdn.meshy.ai/generated/model789.glb',
 *   metadata: {
 *     providerId: 'meshy',
 *     model: 'meshy-3',
 *     format: 'glb',
 *     polyCount: 15000,
 *     materialCount: 3,
 *     hasTextures: true,
 *     hasAnimations: false,
 *   },
 * };
 * ```
 */
export interface Asset3DGenerationResult {
  /** URI to generated 3D asset (provider-hosted, temporary) */
  uri: string;

  /** Normalized metadata about the generation */
  metadata: Asset3DGenerationMetadata;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Interface for 3D asset generation providers.
 *
 * Implementations must:
 * - Support at least one 3D format (glb recommended)
 * - Return immediately on error (no automatic retry)
 * - Normalize responses to standard format
 *
 * @example
 * ```typescript
 * @Injectable()
 * class MeshyAdapter implements Asset3DProviderAdapter {
 *   readonly providerId = 'meshy';
 *
 *   async generate3D(params: Asset3DGenerationParams): Promise<Asset3DGenerationResult> {
 *     // Call Meshy API
 *     // Handle async generation with polling
 *     // Normalize response
 *   }
 * }
 * ```
 */
export interface Asset3DProviderAdapter {
  /** Unique identifier for this provider (e.g., 'meshy', 'kaedim', 'luma') */
  readonly providerId: string;

  /**
   * Generate a 3D asset from the given parameters.
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
  generate3D(params: Asset3DGenerationParams): Promise<Asset3DGenerationResult>;

  /**
   * Check if this provider supports the given parameters.
   *
   * @param params - Parameters to validate
   * @returns true if all parameters are supported, false otherwise
   */
  supportsParams?(params: Asset3DGenerationParams): boolean;
}

// =============================================================================
// Registry Interface
// =============================================================================

/**
 * Registry for 3D asset provider lookup.
 */
export interface Asset3DProviderRegistry {
  /**
   * Get a specific 3D asset provider by ID.
   *
   * @param providerId - Provider identifier (e.g., 'meshy', 'kaedim')
   * @returns The requested provider adapter
   * @throws ProviderError with PROVIDER_NOT_FOUND if not registered
   */
  getProvider(providerId: string): Asset3DProviderAdapter;

  /**
   * Get the default 3D asset provider.
   *
   * @returns The default provider adapter
   */
  getDefaultProvider(): Asset3DProviderAdapter;

  /**
   * List all registered 3D asset providers.
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
