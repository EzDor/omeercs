# Feature Specification: Provider Adapters

**Feature Branch**: `003-provider-adapters`
**Created**: 2026-01-18
**Status**: Draft
**Input**: User description: "Spec 3 — Provider Adapters (Thin Wrappers) - Create a minimal provider abstraction so Skills can call media generation APIs without coupling to any vendor."

## Clarifications

### Session 2026-01-18

- Q: Where do generated asset URIs point to (platform storage vs provider-hosted)? → A: Return provider-hosted URLs directly (temporary, provider-managed expiry). No platform storage layer for initial implementation.
- Q: Which media type/provider should be implemented first for SC-006? → A: Image provider (e.g., Stability AI, DALL-E, or Replicate).
- Q: Should adapters implement retry logic for provider failures? → A: No retries in adapters - return errors immediately, caller (skill/orchestration layer) handles retry.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Skill Requests Image Generation (Priority: P1)

A skill developer builds a skill that needs to generate images. The skill calls the ImageProvider interface with a prompt and parameters, and receives back a generated image URI with metadata. The skill doesn't need to know which underlying provider (DALL-E, Midjourney, Stability AI, etc.) is being used.

**Why this priority**: This is the foundational use case - image generation is the most common media generation need and validates the entire provider abstraction pattern.

**Independent Test**: Can be fully tested by creating a simple skill that requests image generation with a text prompt and verifying the returned URI points to a valid image with correct metadata.

**Acceptance Scenarios**:

1. **Given** a registered image provider, **When** a skill calls `ImageProvider.generateImage()` with a prompt and format, **Then** the system returns a URI pointing to the generated image and metadata containing provider_id and model
2. **Given** a skill request with optional parameters (negative_prompt, resolution, seed), **When** the skill calls `ImageProvider.generateImage()`, **Then** the provider accepts these parameters and applies them to generation where supported
3. **Given** no image provider is registered for the requested provider_id, **When** a skill calls `ImageProvider.generateImage()`, **Then** the system returns a clear error indicating the provider is unavailable

---

### User Story 2 - Provider Registry Lookup (Priority: P1)

A system component needs to obtain the correct provider implementation for a specific media type. The component queries the ProviderRegistry with a type (image, video, audio, 3D, segmentation) and optional provider_id, and receives the appropriate provider implementation.

**Why this priority**: The registry is essential infrastructure that all provider access depends upon - without it, skills cannot discover and use providers.

**Independent Test**: Can be fully tested by registering providers of different types and verifying the registry returns the correct implementation for each lookup combination.

**Acceptance Scenarios**:

1. **Given** multiple providers registered for type "image", **When** a component calls `ProviderRegistry.get("image", "stability-ai")`, **Then** the registry returns the Stability AI image provider implementation
2. **Given** a provider type with a default provider configured, **When** a component calls `ProviderRegistry.get("image")` without a provider_id, **Then** the registry returns the default provider for that type
3. **Given** a request for an unregistered provider type or id, **When** a component queries the registry, **Then** the registry returns a clear error indicating the provider is not found

---

### User Story 3 - Skill Requests Video Generation (Priority: P2)

A skill developer builds a skill that needs to generate videos, either from a text prompt or from input images/videos (image-to-video, video extension). The skill calls the VideoProvider interface and receives back a generated video URI with metadata.

**Why this priority**: Video generation is increasingly important for content creation and builds on the same abstraction pattern as image generation.

**Independent Test**: Can be fully tested by creating a skill that requests video generation with a prompt, duration, and optional input URIs, then verifying the returned URI points to a valid video.

**Acceptance Scenarios**:

1. **Given** a registered video provider, **When** a skill calls `VideoProvider.generateVideo()` with a prompt and duration_sec, **Then** the system returns a URI pointing to the generated video and metadata containing provider_id, model, and duration_sec
2. **Given** a skill provides input_uris (for image-to-video), **When** the skill calls `VideoProvider.generateVideo()`, **Then** the provider uses the input media as the basis for video generation
3. **Given** a skill requests an unsupported duration, **When** the skill calls `VideoProvider.generateVideo()`, **Then** the system returns a clear error indicating the duration is not supported

---

### User Story 4 - Skill Requests Audio Generation (Priority: P2)

A skill developer builds a skill that needs to generate audio (music, sound effects, speech). The skill calls the AudioProvider interface with appropriate parameters and receives back a generated audio URI with metadata.

**Why this priority**: Audio generation completes the core media types needed for comprehensive content creation skills.

**Independent Test**: Can be fully tested by creating a skill that requests audio generation with a prompt and format, then verifying the returned URI points to a valid audio file.

**Acceptance Scenarios**:

1. **Given** a registered audio provider, **When** a skill calls `AudioProvider.generateAudio()` with a prompt and format, **Then** the system returns a URI pointing to the generated audio and metadata containing provider_id and model
2. **Given** a skill specifies duration_sec for audio, **When** the skill calls `AudioProvider.generateAudio()`, **Then** the generated audio matches the requested duration within reasonable tolerance

---

### User Story 5 - Skill Requests 3D Asset Generation (Priority: P3)

A skill developer builds a skill that needs to generate 3D assets (models, textures). The skill calls the Asset3DProvider interface and receives back a generated 3D asset URI with metadata.

**Why this priority**: 3D asset generation is a specialized need that extends the platform's capabilities for gaming, AR/VR, and product visualization use cases.

**Independent Test**: Can be fully tested by creating a skill that requests 3D asset generation with a prompt and format, then verifying the returned URI points to a valid 3D asset file.

**Acceptance Scenarios**:

1. **Given** a registered 3D provider, **When** a skill calls `Asset3DProvider.generate3D()` with a prompt and format, **Then** the system returns a URI pointing to the generated 3D asset and metadata containing provider_id and model

---

### User Story 6 - Skill Requests Image Segmentation (Priority: P3)

A skill developer builds a skill that needs to segment images (identify objects, create masks, detect boundaries). The skill calls the SegmentationProvider interface with an input image and receives back segmentation results including masks and bounds.

**Why this priority**: Segmentation is a specialized image analysis need that enables advanced editing and composition workflows.

**Independent Test**: Can be fully tested by creating a skill that provides an input image and requests segmentation, then verifying the returned masks and bounds correctly identify objects.

**Acceptance Scenarios**:

1. **Given** a registered segmentation provider, **When** a skill calls `SegmentationProvider.segment()` with an input image URI, **Then** the system returns mask URIs, bounds coordinates, and metadata
2. **Given** a skill provides specific segmentation parameters (object type, confidence threshold), **When** the skill calls `SegmentationProvider.segment()`, **Then** the provider applies these parameters to the segmentation

---

### Edge Cases

- What happens when a provider API is temporarily unavailable? The adapter returns an error immediately with no automatic retry; the caller (skill or orchestration layer) is responsible for retry logic.
- What happens when provider credentials are invalid or expired? The system should return an authentication error without exposing credential details.
- What happens when a skill provides parameters that the specific provider doesn't support (e.g., seed for a provider that doesn't support deterministic generation)? The provider should ignore unsupported optional parameters and proceed, or return a clear warning.
- What happens when the generated content URI expires or is deleted before the skill retrieves it? The system should return a clear error indicating the content is no longer available.
- What happens when brand_assets URIs provided by the skill are invalid or inaccessible? The system should return a clear error identifying which assets could not be accessed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an `ImageProvider` interface with a `generateImage(params)` method that returns `{ uri, metadata }`
- **FR-002**: System MUST provide a `VideoProvider` interface with a `generateVideo(params)` method that returns `{ uri, metadata }`
- **FR-003**: System MUST provide an `AudioProvider` interface with a `generateAudio(params)` method that returns `{ uri, metadata }`
- **FR-004**: System MUST provide an `Asset3DProvider` interface with a `generate3D(params)` method that returns `{ uri, metadata }`
- **FR-005**: System MUST provide a `SegmentationProvider` interface with a `segment(params)` method that returns `{ uri/mask, bounds, metadata }`
- **FR-006**: System MUST provide a `ProviderRegistry` with a `get(type, provider_id?)` method that returns the appropriate provider implementation
- **FR-007**: All provider interfaces MUST accept common parameters: `prompt`, `format`, and optional `negative_prompt`, `duration_sec`, `resolution`, `seed`, `input_uris`, `brand_assets`
- **FR-008**: All provider responses MUST include minimum metadata: `provider_id`, `model`
- **FR-009**: Provider responses SHOULD include additional metadata when available: `duration_sec`, `resolution`, `cost_usd`, `raw_response`
- **FR-010**: System MUST allow registration of multiple providers for the same media type
- **FR-011**: System MUST support configuration of a default provider per media type
- **FR-012**: Provider implementations MUST normalize their responses to the standard `{ uri, metadata }` format regardless of underlying API differences
- **FR-013**: Provider implementations MUST NOT expose vendor-specific details in their public interfaces
- **FR-014**: System MUST provide clear error responses when a requested provider is not registered or unavailable
- **FR-015**: Provider adapters MUST NOT implement automatic retry logic; errors are returned immediately for the caller to handle

### Key Entities

- **Provider**: Represents an external media generation service (e.g., Stability AI, Runway, ElevenLabs). Has a type (image, video, audio, 3D, segmentation), unique identifier, and configuration.
- **Provider Registry**: Central registry that maps provider types and identifiers to their implementations. Supports default provider configuration per type.
- **Generation Parameters**: Common input structure containing prompt, format, and optional parameters (negative_prompt, duration_sec, resolution, seed, input_uris, brand_assets).
- **Generation Result**: Standard output structure containing a URI pointing to the generated content and metadata about the generation. URIs point directly to provider-hosted content (no platform storage layer); skills should consume or cache content before provider expiry.
- **Provider Metadata**: Information about the generation including provider_id, model, and optional fields like duration_sec, resolution, cost_usd, and raw_response for debugging.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Skills can generate media through providers without any knowledge of the underlying vendor implementation
- **SC-002**: New providers can be added to the system without modifying existing skill code
- **SC-003**: Switching between providers of the same type requires only configuration changes, not code changes
- **SC-004**: All provider operations return results within the timeout limits of the underlying provider APIs plus minimal overhead (< 500ms additional latency)
- **SC-005**: Provider errors are translated to user-friendly messages that don't expose internal implementation details
- **SC-006**: At least one concrete image provider adapter (e.g., Stability AI, DALL-E, or Replicate) is implemented and functional for demonstration purposes
- **SC-007**: A sample skill successfully calls a provider adapter and returns an artifact URI
