import { ImageProviderAdapter } from './image-provider.interface';
import { VideoProviderAdapter } from './video-provider.interface';
import { AudioProviderAdapter } from './audio-provider.interface';
import { Asset3DProviderAdapter } from './asset3d-provider.interface';
import { SegmentationProviderAdapter } from './segmentation-provider.interface';

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
 * Provider info for registry listing.
 */
export interface ProviderInfo {
  providerId: string;
  type: ProviderType;
  isDefault: boolean;
  displayName?: string;
  description?: string;
}

/**
 * Generic registry interface for provider lookup.
 */
export interface ProviderRegistry {
  /**
   * Get a provider by type and optional provider ID.
   * If providerId is omitted, returns the default provider for that type.
   * @throws ProviderError with PROVIDER_NOT_FOUND if not found
   */
  get<T extends AnyProviderAdapter>(type: ProviderType, providerId?: string): T;

  /**
   * List all registered providers.
   */
  listProviders(): ProviderInfo[];

  /**
   * List providers of a specific type.
   */
  listProvidersByType(type: ProviderType): ProviderInfo[];

  /**
   * Check if a provider is registered.
   */
  hasProvider(type: ProviderType, providerId: string): boolean;

  /**
   * Get the default provider ID for a type.
   */
  getDefaultProviderId(type: ProviderType): string | undefined;
}
