# Data Model: Provider Adapters

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Date**: 2026-01-18

## Overview

Provider Adapters use interfaces and DTOs rather than database entities. This feature introduces no new database tables - it provides abstraction interfaces for external media generation APIs.

---

## 1. Core Interfaces

### 1.1 Base Generation Types

These foundational types are shared across all provider types.

```typescript
// dto/src/providers/types/generation-params.interface.ts

/**
 * Common parameters for all media generation requests.
 * Provider adapters may support a subset based on underlying API.
 */
export interface GenerationParams {
  /** Primary text prompt describing desired output */
  prompt: string;

  /** Output format (e.g., 'png', 'mp4', 'wav') */
  format?: string;

  /** Text describing what to avoid in generation */
  negativePrompt?: string;

  /** Desired duration in seconds (for video/audio) */
  durationSec?: number;

  /** Resolution string (e.g., '1024x1024', '1920x1080') */
  resolution?: string;

  /** Seed for deterministic generation (best effort) */
  seed?: number;

  /** Input media URIs (for image-to-video, style transfer, etc.) */
  inputUris?: string[];

  /** Brand asset URIs for style reference */
  brandAssets?: string[];
}

/**
 * Standard result from any provider generation call.
 * URIs point to provider-hosted content (no platform storage).
 */
export interface GenerationResult {
  /** URI to generated content (provider-hosted, temporary) */
  uri: string;

  /** Normalized metadata about the generation */
  metadata: ProviderMetadata;
}

/**
 * Metadata returned with every generation.
 * Minimum required: providerId, model.
 */
export interface ProviderMetadata {
  /** Identifier of the provider used (e.g., 'stability', 'dalle') */
  providerId: string;

  /** Model identifier used for generation */
  model: string;

  /** Duration of generated content in seconds */
  durationSec?: number;

  /** Resolution of generated content */
  resolution?: string;

  /** Cost of generation in USD (if available from provider) */
  costUsd?: number;

  /** Raw provider response for debugging (optional) */
  rawResponse?: unknown;
}
```

### 1.2 Provider Error Types

```typescript
// dto/src/providers/types/provider-error.interface.ts

/**
 * Error codes for provider failures.
 */
export enum ProviderErrorCode {
  /** Provider API is unreachable */
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',

  /** Authentication failed (don't expose credential details) */
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

/**
 * Structured error from provider operations.
 */
export interface ProviderErrorDetails {
  code: ProviderErrorCode;
  providerId?: string;
  message: string;
  /** Additional context for debugging (not exposed to users) */
  debugContext?: Record<string, unknown>;
}
```

---

## 2. Provider Type Interfaces

### 2.1 Image Provider

```typescript
// dto/src/providers/interfaces/image-provider.interface.ts

import { GenerationParams, GenerationResult } from '../types';

/**
 * Parameters specific to image generation.
 */
export interface ImageGenerationParams extends GenerationParams {
  /** Image width in pixels */
  width?: number;

  /** Image height in pixels */
  height?: number;

  /** Aspect ratio (e.g., '1:1', '16:9', '9:16') - alternative to width/height */
  aspectRatio?: string;

  /** Number of images to generate */
  numImages?: number;

  /** Quality level */
  quality?: 'standard' | 'hd';

  /** Style preset (provider-specific) */
  style?: string;
}

/**
 * Image-specific metadata.
 */
export interface ImageGenerationMetadata extends ProviderMetadata {
  /** Actual width of generated image */
  width: number;

  /** Actual height of generated image */
  height: number;

  /** Image format (png, jpeg, webp) */
  format: string;

  /** Revised prompt (if provider modified it) */
  revisedPrompt?: string;

  /** Seed used (if deterministic generation supported) */
  seed?: number;
}

/**
 * Image generation result with typed metadata.
 */
export interface ImageGenerationResult extends GenerationResult {
  metadata: ImageGenerationMetadata;
}

/**
 * Interface for image generation providers.
 */
export interface ImageProviderAdapter {
  /** Unique identifier for this provider */
  readonly providerId: string;

  /**
   * Generate an image from parameters.
   * @throws ProviderError on failure (no automatic retry)
   */
  generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult>;

  /**
   * Check if provider supports the given parameters.
   * Useful for parameter validation before submission.
   */
  supportsParams?(params: ImageGenerationParams): boolean;
}
```

### 2.2 Video Provider

```typescript
// dto/src/providers/interfaces/video-provider.interface.ts

import { GenerationParams, GenerationResult, ProviderMetadata } from '../types';

/**
 * Parameters specific to video generation.
 */
export interface VideoGenerationParams extends GenerationParams {
  /** Desired video duration in seconds */
  durationSec: number;

  /** Frame rate (e.g., 24, 30, 60) */
  fps?: number;

  /** Video codec (e.g., 'h264', 'h265') */
  codec?: string;

  /** Input URIs for image-to-video or video extension */
  inputUris?: string[];

  /** Motion amount/style (provider-specific) */
  motion?: string;
}

/**
 * Video-specific metadata.
 */
export interface VideoGenerationMetadata extends ProviderMetadata {
  /** Actual duration in seconds */
  durationSec: number;

  /** Video resolution (e.g., '1920x1080') */
  resolution: string;

  /** Frame rate */
  fps: number;

  /** Video format (mp4, webm) */
  format: string;
}

/**
 * Video generation result with typed metadata.
 */
export interface VideoGenerationResult extends GenerationResult {
  metadata: VideoGenerationMetadata;
}

/**
 * Interface for video generation providers.
 */
export interface VideoProviderAdapter {
  readonly providerId: string;
  generateVideo(params: VideoGenerationParams): Promise<VideoGenerationResult>;
  supportsParams?(params: VideoGenerationParams): boolean;
}
```

### 2.3 Audio Provider

```typescript
// dto/src/providers/interfaces/audio-provider.interface.ts

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
  readonly providerId: string;
  generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult>;
  supportsParams?(params: AudioGenerationParams): boolean;
}
```

### 2.4 3D Asset Provider

```typescript
// dto/src/providers/interfaces/asset3d-provider.interface.ts

import { GenerationParams, GenerationResult, ProviderMetadata } from '../types';

/**
 * Parameters specific to 3D asset generation.
 */
export interface Asset3DGenerationParams extends GenerationParams {
  /** 3D format (glb, gltf, obj, fbx, usdz) */
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
  readonly providerId: string;
  generate3D(params: Asset3DGenerationParams): Promise<Asset3DGenerationResult>;
  supportsParams?(params: Asset3DGenerationParams): boolean;
}
```

### 2.5 Segmentation Provider

```typescript
// dto/src/providers/interfaces/segmentation-provider.interface.ts

import { GenerationParams, ProviderMetadata } from '../types';

/**
 * Parameters specific to image segmentation.
 */
export interface SegmentationParams {
  /** Input image URI to segment */
  inputUri: string;

  /** Segmentation mode */
  mode?: 'semantic' | 'instance' | 'panoptic';

  /** Object types to detect (if supported) */
  objectTypes?: string[];

  /** Minimum confidence threshold (0-1) */
  confidenceThreshold?: number;

  /** Maximum number of segments to return */
  maxSegments?: number;
}

/**
 * Bounding box coordinates.
 */
export interface BoundingBox {
  /** X coordinate of top-left corner */
  x: number;

  /** Y coordinate of top-left corner */
  y: number;

  /** Width of bounding box */
  width: number;

  /** Height of bounding box */
  height: number;
}

/**
 * Individual segment result.
 */
export interface Segment {
  /** Segment identifier */
  id: string;

  /** Object label/class */
  label: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** URI to mask image */
  maskUri: string;

  /** Bounding box coordinates */
  bounds: BoundingBox;
}

/**
 * Segmentation-specific metadata.
 */
export interface SegmentationMetadata extends ProviderMetadata {
  /** Input image dimensions */
  inputResolution: string;

  /** Number of segments found */
  segmentCount: number;

  /** Segmentation mode used */
  mode: string;
}

/**
 * Segmentation result.
 */
export interface SegmentationResult {
  /** Array of detected segments */
  segments: Segment[];

  /** Normalized metadata */
  metadata: SegmentationMetadata;
}

/**
 * Interface for segmentation providers.
 */
export interface SegmentationProviderAdapter {
  readonly providerId: string;
  segment(params: SegmentationParams): Promise<SegmentationResult>;
  supportsParams?(params: SegmentationParams): boolean;
}
```

---

## 3. Registry Interfaces

```typescript
// dto/src/providers/interfaces/provider-registry.interface.ts

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
   * Check if a provider is registered.
   */
  hasProvider(type: ProviderType, providerId: string): boolean;
}
```

---

## 4. Package Structure

```
dto/src/providers/
├── index.ts                              # Barrel export
├── types/
│   ├── index.ts
│   ├── generation-params.interface.ts   # GenerationParams, GenerationResult
│   └── provider-error.interface.ts      # ProviderErrorCode, ProviderErrorDetails
└── interfaces/
    ├── index.ts
    ├── image-provider.interface.ts       # ImageProviderAdapter
    ├── video-provider.interface.ts       # VideoProviderAdapter
    ├── audio-provider.interface.ts       # AudioProviderAdapter
    ├── asset3d-provider.interface.ts     # Asset3DProviderAdapter
    ├── segmentation-provider.interface.ts # SegmentationProviderAdapter
    └── provider-registry.interface.ts    # ProviderRegistry
```

---

## 5. Validation Rules

### 5.1 Common Validation

| Field | Rule | Error |
|-------|------|-------|
| `prompt` | Required, non-empty, max 4000 chars | INVALID_PARAMS |
| `format` | Must be supported by provider | INVALID_PARAMS |
| `seed` | Integer, non-negative | INVALID_PARAMS |
| `inputUris` | Each must be valid URL | INVALID_PARAMS |

### 5.2 Image-Specific Validation

| Field | Rule | Error |
|-------|------|-------|
| `width` | 256-4096, multiple of 64 (provider-dependent) | INVALID_PARAMS |
| `height` | 256-4096, multiple of 64 (provider-dependent) | INVALID_PARAMS |
| `numImages` | 1-10 (provider-dependent) | INVALID_PARAMS |

### 5.3 Video-Specific Validation

| Field | Rule | Error |
|-------|------|-------|
| `durationSec` | Required, 1-300 (provider-dependent) | INVALID_PARAMS |
| `fps` | 1-60 | INVALID_PARAMS |

### 5.4 Audio-Specific Validation

| Field | Rule | Error |
|-------|------|-------|
| `durationSec` | 1-600 (provider-dependent) | INVALID_PARAMS |
| `sampleRate` | 8000-96000 | INVALID_PARAMS |
| `channels` | 1 or 2 | INVALID_PARAMS |

---

## 6. State Transitions

Provider adapters are stateless - each call is independent. No state machine.

However, generated content has a lifecycle:

```
[Generation Request]
       │
       ▼
[Provider Processing]
       │
       ▼
[Content Available] ─── URI returned to caller
       │
       ▼ (provider-managed expiry)
[Content Expired] ─── URI no longer accessible
```

**Important**: Skills should cache or consume generated content before provider expiry. URIs are temporary.

---

## 7. Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                        ProviderRegistry                          │
│  get(type, providerId?) → AnyProviderAdapter                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ImageProvider  │ │VideoProvider  │ │AudioProvider  │ ...
│  Registry     │ │  Registry     │ │  Registry     │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │                 │                 │
   ┌────┴────┐       ┌────┴────┐       ┌────┴────┐
   │         │       │         │       │         │
   ▼         ▼       ▼         ▼       ▼         ▼
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│Stab │ │DALLE│ │Runway│ │Pika │ │Elev │ │Suno │
│ility│ │  3  │ │      │ │Labs │ │enLab│ │     │
└─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘
```

---

## 8. Database Impact

**No database tables required.**

Provider Adapters are:
- Stateless wrappers over external APIs
- No persistent storage of generated content
- URIs point to provider-hosted content

If future requirements need:
- **Usage tracking**: Add to existing telemetry/audit tables
- **Cost aggregation**: Use SkillDebugInfo.provider_calls
- **Caching**: Would be a separate feature spec
