/**
 * Segmentation Provider Contract
 *
 * This file defines the contract for SegmentationProviderAdapter implementations.
 * Location in codebase: dto/src/providers/interfaces/segmentation-provider.interface.ts
 *
 * @module dto/providers
 */

import { ProviderMetadata } from './image-provider.contract';

// =============================================================================
// Segmentation-Specific Types
// =============================================================================

/**
 * Segmentation mode types.
 */
export type SegmentationMode = 'semantic' | 'instance' | 'panoptic';

/**
 * Bounding box coordinates for a detected segment.
 */
export interface BoundingBox {
  /** X coordinate of top-left corner (pixels) */
  x: number;

  /** Y coordinate of top-left corner (pixels) */
  y: number;

  /** Width of bounding box (pixels) */
  width: number;

  /** Height of bounding box (pixels) */
  height: number;
}

/**
 * Individual detected segment.
 */
export interface Segment {
  /** Unique identifier for this segment */
  id: string;

  /** Object label/class (e.g., 'person', 'car', 'building') */
  label: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** URI to mask image (binary or alpha mask) */
  maskUri: string;

  /** Bounding box coordinates */
  bounds: BoundingBox;

  /** Segment area in pixels */
  area?: number;

  /** Category ID (for semantic segmentation) */
  categoryId?: number;
}

/**
 * Parameters for segmentation requests.
 *
 * @example
 * ```typescript
 * const params: SegmentationParams = {
 *   inputUri: 'https://example.com/image.jpg',
 *   mode: 'instance',
 *   objectTypes: ['person', 'car'],
 *   confidenceThreshold: 0.7,
 * };
 * ```
 */
export interface SegmentationParams {
  /** Input image URI to segment (required) */
  inputUri: string;

  /** Segmentation mode */
  mode?: SegmentationMode;

  /** Object types to detect (if supported by provider) */
  objectTypes?: string[];

  /** Minimum confidence threshold (0-1) */
  confidenceThreshold?: number;

  /** Maximum number of segments to return */
  maxSegments?: number;

  /** Return masks in specific format (png, binary) */
  maskFormat?: 'png' | 'binary';
}

/**
 * Segmentation-specific metadata returned with result.
 */
export interface SegmentationMetadata extends ProviderMetadata {
  /** Input image resolution */
  inputResolution: string;

  /** Number of segments detected */
  segmentCount: number;

  /** Segmentation mode used */
  mode: SegmentationMode;

  /** Processing time in milliseconds */
  processingTimeMs?: number;
}

/**
 * Result of a segmentation request.
 *
 * @example
 * ```typescript
 * const result: SegmentationResult = {
 *   segments: [
 *     {
 *       id: 'seg_001',
 *       label: 'person',
 *       confidence: 0.95,
 *       maskUri: 'https://cdn.sam.ai/masks/seg_001.png',
 *       bounds: { x: 100, y: 50, width: 200, height: 400 },
 *     },
 *     {
 *       id: 'seg_002',
 *       label: 'car',
 *       confidence: 0.88,
 *       maskUri: 'https://cdn.sam.ai/masks/seg_002.png',
 *       bounds: { x: 400, y: 200, width: 300, height: 150 },
 *     },
 *   ],
 *   metadata: {
 *     providerId: 'sam',
 *     model: 'sam-2',
 *     inputResolution: '1920x1080',
 *     segmentCount: 2,
 *     mode: 'instance',
 *   },
 * };
 * ```
 */
export interface SegmentationResult {
  /** Array of detected segments with masks and bounds */
  segments: Segment[];

  /** Normalized metadata about the segmentation */
  metadata: SegmentationMetadata;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Interface for image segmentation providers.
 *
 * Implementations must:
 * - Support at least semantic or instance segmentation
 * - Return masks as URIs (provider-hosted)
 * - Return immediately on error (no automatic retry)
 * - Normalize responses to standard format
 *
 * @example
 * ```typescript
 * @Injectable()
 * class SAMAdapter implements SegmentationProviderAdapter {
 *   readonly providerId = 'sam';
 *
 *   async segment(params: SegmentationParams): Promise<SegmentationResult> {
 *     // Call SAM API
 *     // Process segments
 *     // Normalize response
 *   }
 * }
 * ```
 */
export interface SegmentationProviderAdapter {
  /** Unique identifier for this provider (e.g., 'sam', 'detectron', 'roboflow') */
  readonly providerId: string;

  /**
   * Segment an image into distinct regions.
   *
   * @param params - Segmentation parameters
   * @returns Promise resolving to segmentation result with segments and metadata
   * @throws ProviderError on any failure (no automatic retry)
   *
   * Error conditions:
   * - PROVIDER_UNAVAILABLE: Provider API is unreachable
   * - AUTHENTICATION_ERROR: Invalid credentials
   * - RATE_LIMITED: Too many requests
   * - GENERATION_FAILED: Segmentation failed
   * - INVALID_PARAMS: Unsupported parameters
   * - CONTENT_UNAVAILABLE: Input URI inaccessible
   */
  segment(params: SegmentationParams): Promise<SegmentationResult>;

  /**
   * Check if this provider supports the given parameters.
   *
   * @param params - Parameters to validate
   * @returns true if all parameters are supported, false otherwise
   */
  supportsParams?(params: SegmentationParams): boolean;
}

// =============================================================================
// Registry Interface
// =============================================================================

/**
 * Registry for segmentation provider lookup.
 */
export interface SegmentationProviderRegistry {
  /**
   * Get a specific segmentation provider by ID.
   *
   * @param providerId - Provider identifier (e.g., 'sam', 'detectron')
   * @returns The requested provider adapter
   * @throws ProviderError with PROVIDER_NOT_FOUND if not registered
   */
  getProvider(providerId: string): SegmentationProviderAdapter;

  /**
   * Get the default segmentation provider.
   *
   * @returns The default provider adapter
   */
  getDefaultProvider(): SegmentationProviderAdapter;

  /**
   * List all registered segmentation providers.
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
