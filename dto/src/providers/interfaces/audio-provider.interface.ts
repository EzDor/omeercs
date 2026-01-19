import { GenerationParams, GenerationResult, ProviderMetadata } from '../types';

/**
 * Parameters specific to audio generation.
 */
export interface AudioGenerationParams extends GenerationParams {
  /** Desired audio duration in seconds */
  durationSec?: number;

  /** Audio type (music, sfx, speech, ambient) */
  audioType?: 'music' | 'sfx' | 'speech' | 'ambient';

  /** Sample rate (e.g., 44100, 48000) */
  sampleRate?: number;

  /** Number of channels (1=mono, 2=stereo) */
  channels?: number;

  /** Voice ID for speech synthesis */
  voiceId?: string;
}

/**
 * Audio-specific metadata.
 */
export interface AudioGenerationMetadata extends ProviderMetadata {
  /** Actual duration in seconds */
  durationSec: number;

  /** Audio format (wav, mp3, ogg) */
  format: string;

  /** Sample rate */
  sampleRate: number;

  /** Number of channels */
  channels: number;
}

/**
 * Audio generation result with typed metadata.
 */
export interface AudioGenerationResult extends GenerationResult {
  metadata: AudioGenerationMetadata;
}

/**
 * Interface for audio generation providers.
 */
export interface AudioProviderAdapter {
  /** Unique identifier for this provider */
  readonly providerId: string;

  /**
   * Generate audio from parameters.
   * @throws ProviderError on failure (no automatic retry)
   */
  generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult>;

  /**
   * Check if provider supports the given parameters.
   * Useful for parameter validation before submission.
   */
  supportsParams?(params: AudioGenerationParams): boolean;
}
