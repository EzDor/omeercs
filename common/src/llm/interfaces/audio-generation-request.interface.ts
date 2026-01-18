/**
 * Audio generation request for LiteLLM/AI audio providers
 * Supports music generation (BGM) and sound effects (SFX)
 */
export interface AudioGenerationRequest {
  /** Model identifier (e.g., 'suno-v3', 'musicgen', 'audiogen') */
  model: string;

  /** Text prompt describing the audio to generate */
  prompt?: string;

  /** Target duration in seconds */
  duration_sec?: number;

  /** Audio format (mp3, wav, ogg, aac) */
  format?: string;

  /** Sample rate in Hz */
  sample_rate?: number;

  /** Bitrate in kbps (for lossy formats) */
  bitrate_kbps?: number;

  /** Number of audio channels (1 = mono, 2 = stereo) */
  channels?: number;

  /** Seed for reproducible generation */
  seed?: number;

  /** Temperature for generation randomness */
  temperature?: number;

  /** Music-specific: tempo in BPM */
  bpm?: number;

  /** Music-specific: whether audio should loop seamlessly */
  loopable?: boolean;

  /** Music-specific: genre/style */
  genre?: string;

  /** Music-specific: mood */
  mood?: string;

  /** Music-specific: instrument preferences */
  instruments?: string;

  /** SFX-specific: type of sound effect */
  sfx_type?: string;

  /** Webhook URL for async completion notification */
  webhook_url?: string;
}

/**
 * Individual generated audio data
 */
export interface AudioGenerationResponseData {
  /** URL to the generated audio file */
  url?: string;

  /** Base64 encoded audio data (if inline) */
  b64_audio?: string;

  /** Actual duration in seconds */
  duration_sec?: number;

  /** Sample rate */
  sample_rate?: number;

  /** Bitrate in kbps */
  bitrate_kbps?: number;

  /** Format of the audio */
  format?: string;

  /** Detected BPM (for music) */
  bpm?: number;
}

/**
 * Audio generation response
 */
export interface AudioGenerationResponse {
  /** Unix timestamp of creation */
  created: number;

  /** Generated audio data */
  data: AudioGenerationResponseData[];

  /** Generation ID for async tracking */
  id?: string;

  /** Status for async generation */
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

/**
 * Request to check audio generation status
 */
export interface AudioGenerationStatusRequest {
  /** Generation ID to check */
  generation_id: string;
}

/**
 * Audio generation status response
 */
export interface AudioGenerationStatusResponse {
  /** Generation ID */
  id: string;

  /** Current status */
  status: 'pending' | 'processing' | 'completed' | 'failed';

  /** Progress percentage (0-100) */
  progress?: number;

  /** Generated audio data (when completed) */
  data?: AudioGenerationResponseData;

  /** Error message (when failed) */
  error?: string;
}
