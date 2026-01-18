/**
 * Video generation request for image-to-video or text-to-video
 */
export interface VideoGenerationRequest {
  model: string;
  prompt?: string;
  image_url?: string;
  image_base64?: string;
  duration?: number; // Duration in seconds
  fps?: number;
  width?: number;
  height?: number;
  motion_bucket_id?: number; // For Stable Video Diffusion
  noise_aug_strength?: number;
  seed?: number;
  cfg_scale?: number;
  // For async generation (some providers)
  webhook_url?: string;
}

/**
 * Video generation response data
 */
export interface VideoGenerationResponseData {
  url?: string;
  b64_json?: string;
  generation_id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  // Video metadata (may not be present until completed)
  duration_sec?: number;
  width?: number;
  height?: number;
  fps?: number;
}

/**
 * Video generation response
 */
export interface VideoGenerationResponse {
  created: number;
  data: VideoGenerationResponseData[];
  // For async generation
  id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

/**
 * Video generation status check request
 */
export interface VideoGenerationStatusRequest {
  generation_id: string;
  model?: string;
}

/**
 * Video generation status response
 */
export interface VideoGenerationStatusResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100
  data?: VideoGenerationResponseData;
  error?: string;
}
