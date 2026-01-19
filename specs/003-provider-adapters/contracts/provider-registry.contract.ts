/**
 * Provider Registry Contract
 *
 * This file defines the unified ProviderRegistry interface for looking up
 * any provider type. Individual type-specific registries are defined in
 * their respective contract files.
 *
 * Location in codebase: dto/src/providers/interfaces/provider-registry.interface.ts
 *
 * @module dto/providers
 */

import { ImageProviderAdapter } from './image-provider.contract';
import { VideoProviderAdapter } from './video-provider.contract';
import { AudioProviderAdapter } from './audio-provider.contract';
import { Asset3DProviderAdapter } from './asset3d-provider.contract';
import { SegmentationProviderAdapter } from './segmentation-provider.contract';

// =============================================================================
// Registry Types
// =============================================================================

/**
 * Supported provider types.
 */
export type ProviderType = 'image' | 'video' | 'audio' | '3d' | 'segmentation';

/**
 * Union type of all provider adapters.
 */
export type AnyProviderAdapter =
  | ImageProviderAdapter
  | VideoProviderAdapter
  | AudioProviderAdapter
  | Asset3DProviderAdapter
  | SegmentationProviderAdapter;

/**
 * Provider information for registry listing.
 */
export interface ProviderInfo {
  /** Provider identifier */
  providerId: string;

  /** Provider type */
  type: ProviderType;

  /** Whether this is the default provider for its type */
  isDefault: boolean;

  /** Human-readable display name */
  displayName?: string;

  /** Provider description */
  description?: string;
}

/**
 * Provider error codes.
 */
export enum ProviderErrorCode {
  /** Provider API is unreachable */
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',

  /** Authentication failed */
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',

  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',

  /** Generation request failed */
  GENERATION_FAILED = 'GENERATION_FAILED',

  /** Invalid or unsupported parameters */
  INVALID_PARAMS = 'INVALID_PARAMS',

  /** Provider not found in registry */
  PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',

  /** Content URI expired or inaccessible */
  CONTENT_UNAVAILABLE = 'CONTENT_UNAVAILABLE',
}

// =============================================================================
// Unified Registry Interface
// =============================================================================

/**
 * Unified provider registry for all provider types.
 *
 * This is the main entry point for provider lookup in skills and services.
 * It provides type-safe access to providers of any type.
 *
 * @example
 * ```typescript
 * @Injectable()
 * class MySkillHandler {
 *   constructor(private readonly providerRegistry: ProviderRegistry) {}
 *
 *   async execute(input: Input) {
 *     // Get specific image provider
 *     const imageProvider = this.providerRegistry.get<ImageProviderAdapter>('image', 'stability');
 *     const imageResult = await imageProvider.generateImage({ prompt: '...' });
 *
 *     // Get default video provider
 *     const videoProvider = this.providerRegistry.get<VideoProviderAdapter>('video');
 *     const videoResult = await videoProvider.generateVideo({ prompt: '...', durationSec: 5 });
 *   }
 * }
 * ```
 */
export interface ProviderRegistry {
  /**
   * Get a provider by type and optional provider ID.
   *
   * If providerId is omitted, returns the default provider for that type.
   *
   * @typeParam T - Expected provider adapter type
   * @param type - Provider type ('image', 'video', 'audio', '3d', 'segmentation')
   * @param providerId - Optional specific provider ID
   * @returns The requested provider adapter
   * @throws ProviderError with PROVIDER_NOT_FOUND if type/provider not registered
   *
   * @example
   * ```typescript
   * // Get specific provider
   * const stability = registry.get<ImageProviderAdapter>('image', 'stability');
   *
   * // Get default provider for type
   * const defaultImage = registry.get<ImageProviderAdapter>('image');
   * ```
   */
  get<T extends AnyProviderAdapter>(type: ProviderType, providerId?: string): T;

  /**
   * List all registered providers.
   *
   * @returns Array of ProviderInfo objects
   *
   * @example
   * ```typescript
   * const providers = registry.listProviders();
   * // [
   * //   { providerId: 'stability', type: 'image', isDefault: true },
   * //   { providerId: 'dalle', type: 'image', isDefault: false },
   * //   { providerId: 'runway', type: 'video', isDefault: true },
   * // ]
   * ```
   */
  listProviders(): ProviderInfo[];

  /**
   * List providers of a specific type.
   *
   * @param type - Provider type to filter by
   * @returns Array of ProviderInfo objects for that type
   */
  listProvidersByType(type: ProviderType): ProviderInfo[];

  /**
   * Check if a provider is registered.
   *
   * @param type - Provider type
   * @param providerId - Provider identifier
   * @returns true if registered, false otherwise
   */
  hasProvider(type: ProviderType, providerId: string): boolean;

  /**
   * Get the default provider ID for a type.
   *
   * @param type - Provider type
   * @returns The default provider ID, or undefined if no default configured
   */
  getDefaultProviderId(type: ProviderType): string | undefined;
}

// =============================================================================
// Provider Error Class (for implementations)
// =============================================================================

/**
 * Error class for provider-related failures.
 *
 * Implementations should throw this when provider operations fail.
 *
 * @example
 * ```typescript
 * if (!response.ok) {
 *   throw new ProviderError(
 *     ProviderErrorCode.GENERATION_FAILED,
 *     'stability',
 *     `Image generation failed: ${response.statusText}`,
 *     { statusCode: response.status },
 *   );
 * }
 * ```
 */
export interface ProviderError extends Error {
  /** Error code from ProviderErrorCode enum */
  readonly code: ProviderErrorCode;

  /** Provider that caused the error (if applicable) */
  readonly providerId?: string;

  /** Additional debug context */
  readonly debugContext?: Record<string, unknown>;

  /** Convert to JSON for serialization */
  toJSON(): {
    code: ProviderErrorCode;
    message: string;
    providerId?: string;
    debugContext?: Record<string, unknown>;
  };
}

// =============================================================================
// Module Configuration (for NestJS)
// =============================================================================

/**
 * Configuration options for provider module.
 *
 * Used with ProvidersModule.forRoot() to configure providers.
 */
export interface ProvidersModuleConfig {
  /** Image providers to register */
  imageProviders?: {
    providerId: string;
    isDefault?: boolean;
    config?: Record<string, unknown>;
  }[];

  /** Video providers to register */
  videoProviders?: {
    providerId: string;
    isDefault?: boolean;
    config?: Record<string, unknown>;
  }[];

  /** Audio providers to register */
  audioProviders?: {
    providerId: string;
    isDefault?: boolean;
    config?: Record<string, unknown>;
  }[];

  /** 3D providers to register */
  asset3dProviders?: {
    providerId: string;
    isDefault?: boolean;
    config?: Record<string, unknown>;
  }[];

  /** Segmentation providers to register */
  segmentationProviders?: {
    providerId: string;
    isDefault?: boolean;
    config?: Record<string, unknown>;
  }[];
}
