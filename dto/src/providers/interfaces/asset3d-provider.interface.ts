import { GenerationParams, GenerationResult, ProviderMetadata } from '../types/generation-params.interface';

/**
 * Parameters specific to 3D asset generation.
 */
export interface Asset3DGenerationParams extends GenerationParams {
  /** 3D format (glb, gltf, obj, fbx, usdz) - overrides base format */
  format: string;

  /** Level of detail */
  lod?: 'low' | 'medium' | 'high';

  /** Include textures */
  includeTextures?: boolean;

  /** Include animations */
  includeAnimations?: boolean;

  /** Polygon count target */
  polyCountTarget?: number;
}

/**
 * 3D asset-specific metadata.
 */
export interface Asset3DGenerationMetadata extends ProviderMetadata {
  /** 3D format */
  format: string;

  /** Polygon count */
  polyCount?: number;

  /** Number of materials */
  materialCount?: number;

  /** Whether textures are included */
  hasTextures: boolean;

  /** Whether animations are included */
  hasAnimations: boolean;
}

/**
 * 3D asset generation result with typed metadata.
 */
export interface Asset3DGenerationResult extends GenerationResult {
  metadata: Asset3DGenerationMetadata;
}

/**
 * Interface for 3D asset generation providers.
 */
export interface Asset3DProviderAdapter {
  /** Unique identifier for this provider */
  readonly providerId: string;

  /**
   * Generate a 3D asset from parameters.
   * @throws ProviderError on failure (no automatic retry)
   */
  generate3D(params: Asset3DGenerationParams): Promise<Asset3DGenerationResult>;

  /**
   * Check if provider supports the given parameters.
   * Useful for parameter validation before submission.
   */
  supportsParams?(params: Asset3DGenerationParams): boolean;
}
