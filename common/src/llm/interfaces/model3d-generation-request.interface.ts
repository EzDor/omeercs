/**
 * Request interface for 3D model generation via LiteLLM
 */
export interface Model3DGenerationRequest {
  model: string;
  prompt: string;
  format?: 'glb' | 'gltf' | 'obj' | 'fbx' | 'usdz';
  style?: string;
  category?: string;
  max_triangles?: number;
  max_vertices?: number;
  target_platform?: 'mobile' | 'web' | 'desktop' | 'vr' | 'cinematic';
  generate_textures?: boolean;
  texture_resolution?: string;
  embed_textures?: boolean;
  generate_lods?: boolean;
  lod_count?: number;
  reference_image_url?: string;
  color_palette?: string[];
  material_style?: string;
  scale?: number;
  center_origin?: boolean;
  seed?: number;
}

/**
 * Data returned for a generated 3D model
 */
export interface Model3DGenerationResponseData {
  url: string;
  format: string;
  file_size_bytes?: number;
  triangles?: number;
  vertices?: number;
  materials?: number;
  textures?: {
    count: number;
    urls?: string[];
    total_size_bytes?: number;
    resolution?: string;
  };
  lods?: {
    count: number;
    urls: string[];
  };
  bounding_box?: {
    width: number;
    height: number;
    depth: number;
  };
}

/**
 * Response from 3D model generation API
 */
export interface Model3DGenerationResponse {
  created: number;
  data: Model3DGenerationResponseData[];
  id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

/**
 * Request to check 3D generation status
 */
export interface Model3DGenerationStatusRequest {
  generation_id: string;
}

/**
 * Response from 3D generation status check
 */
export interface Model3DGenerationStatusResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  data?: Model3DGenerationResponseData;
  error?: string;
}

/**
 * Request interface for 3D model optimization
 */
export interface Model3DOptimizationRequest {
  model: string;
  model_url: string;
  output_format?: 'glb' | 'gltf' | 'obj' | 'fbx' | 'usdz';
  optimization_level?: 'minimal' | 'balanced' | 'aggressive' | 'maximum';
  target_platform?: 'mobile' | 'web' | 'desktop' | 'vr' | 'console';
  max_triangles?: number;
  max_vertices?: number;
  simplification_ratio?: number;
  preserve_uv_seams?: boolean;
  preserve_hard_edges?: boolean;
  texture_max_resolution?: string;
  texture_format?: 'png' | 'jpg' | 'webp' | 'ktx2' | 'basis';
  texture_quality?: number;
  compress_textures?: boolean;
  atlas_textures?: boolean;
  generate_lods?: boolean;
  lod_count?: number;
  draco_compression?: boolean;
  draco_compression_level?: number;
  meshopt_compression?: boolean;
  max_file_size_bytes?: number;
}

/**
 * Response data for optimized 3D model
 */
export interface Model3DOptimizationResponseData {
  url: string;
  format: string;
  file_size_bytes: number;
  triangles: number;
  vertices: number;
  materials: number;
  textures?: {
    count: number;
    urls?: string[];
    total_size_bytes: number;
    resolution: string;
    format: string;
    compressed: boolean;
  };
  lods?: {
    count: number;
    urls: string[];
    triangle_counts: number[];
  };
  original_metrics?: {
    triangles: number;
    vertices: number;
    textures_size_bytes: number;
    file_size_bytes: number;
  };
}

/**
 * Response from 3D optimization API
 */
export interface Model3DOptimizationResponse {
  created: number;
  data: Model3DOptimizationResponseData[];
  id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

/**
 * Request to check 3D optimization status
 */
export interface Model3DOptimizationStatusRequest {
  optimization_id: string;
}

/**
 * Response from 3D optimization status check
 */
export interface Model3DOptimizationStatusResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  data?: Model3DOptimizationResponseData;
  error?: string;
}
