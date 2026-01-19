/**
 * Audio Provider Contract
 *
 * This file defines the contract for AudioProviderAdapter implementations.
 * Location in codebase: dto/src/providers/interfaces/audio-provider.interface.ts
 *
 * @module dto/providers
 */

import { ProviderMetadata } from './image-provider.contract';

// =============================================================================
// Audio-Specific Types
// =============================================================================

/**
 * Audio generation type categories.
 */
export type AudioType = 'music' | 'sfx' | 'speech' | 'ambient';

/**
 * Parameters for audio generation requests.
 *
 * @example
 * ```typescript
 * const params: AudioGenerationParams = {
 *   prompt: 'Epic orchestral battle music with drums',
 *   audioType: 'music',
 *   durationSec: 30,
 *   format: 'wav',
 * };
 * ```
 */
export interface AudioGenerationParams {
  /** Primary text prompt describing desired audio (required) */
  prompt: string;

  /** Desired audio duration in seconds */
  durationSec?: number;

  /** Audio type category */
  audioType?: AudioType;

  /** Output format (e.g., 'wav', 'mp3', 'ogg') */
  format?: string;

  /** Sample rate (e.g., 44100, 48000) */
  sampleRate?: number;

  /** Number of channels (1=mono, 2=stereo) */
  channels?: number;

  /** Voice ID for speech synthesis (provider-specific) */
  voiceId?: string;

  /** Text describing what to avoid in generation */
  negativePrompt?: string;

  /** Seed for deterministic generation */
  seed?: number;

  /** Brand asset URIs for style reference */
  brandAssets?: string[];
}

/**
 * Audio-specific metadata returned with generation result.
 */
export interface AudioGenerationMetadata extends ProviderMetadata {
  /** Actual duration in seconds */
  durationSec: number;

  /** Audio format (wav, mp3, ogg) */
  format: string;

  /** Sample rate in Hz */
  sampleRate: number;

  /** Number of channels */
  channels: number;

  /** Bit depth (e.g., 16, 24) */
  bitDepth?: number;

  /** File size in bytes (if available) */
  fileSizeBytes?: number;
}

/**
 * Result of an audio generation request.
 *
 * @example
 * ```typescript
 * const result: AudioGenerationResult = {
 *   uri: 'https://cdn.elevenlabs.io/generated/audio456.wav',
 *   metadata: {
 *     providerId: 'elevenlabs',
 *     model: 'eleven_multilingual_v2',
 *     durationSec: 30,
 *     format: 'wav',
 *     sampleRate: 44100,
 *     channels: 2,
 *   },
 * };
 * ```
 */
export interface AudioGenerationResult {
  /** URI to generated audio (provider-hosted, temporary) */
  uri: string;

  /** Normalized metadata about the generation */
  metadata: AudioGenerationMetadata;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Interface for audio generation providers.
 *
 * Implementations must:
 * - Support at least one audioType (music, sfx, speech, ambient)
 * - Return immediately on error (no automatic retry)
 * - Normalize responses to standard format
 *
 * @example
 * ```typescript
 * @Injectable()
 * class ElevenLabsAdapter implements AudioProviderAdapter {
 *   readonly providerId = 'elevenlabs';
 *
 *   async generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult> {
 *     // Call ElevenLabs API
 *     // Normalize response
 *   }
 * }
 * ```
 */
export interface AudioProviderAdapter {
  /** Unique identifier for this provider (e.g., 'elevenlabs', 'suno', 'bark') */
  readonly providerId: string;

  /**
   * Generate audio from the given parameters.
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
  generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult>;

  /**
   * Check if this provider supports the given parameters.
   *
   * @param params - Parameters to validate
   * @returns true if all parameters are supported, false otherwise
   */
  supportsParams?(params: AudioGenerationParams): boolean;
}

// =============================================================================
// Registry Interface
// =============================================================================

/**
 * Registry for audio provider lookup.
 */
export interface AudioProviderRegistry {
  /**
   * Get a specific audio provider by ID.
   *
   * @param providerId - Provider identifier (e.g., 'elevenlabs', 'suno')
   * @returns The requested provider adapter
   * @throws ProviderError with PROVIDER_NOT_FOUND if not registered
   */
  getProvider(providerId: string): AudioProviderAdapter;

  /**
   * Get the default audio provider.
   *
   * @returns The default provider adapter
   */
  getDefaultProvider(): AudioProviderAdapter;

  /**
   * List all registered audio providers.
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
