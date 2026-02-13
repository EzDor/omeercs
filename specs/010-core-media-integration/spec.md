# Feature Specification: Core Media Integration

**Feature Branch**: `010-core-media-integration`
**Created**: 2026-02-12
**Status**: Draft
**Input**: User description: "Phase 1 core integration: asset storage S3/CDN, audio provider Suno/Nano Banana, image/3D provider Meshy/Nano Banana, video provider Nano Banana"

## Clarifications

### Session 2026-02-12

- Q: What is the asset storage and serving model for Phase 1? → A: Local filesystem hosting — assets are stored on the local filesystem and served via HTTP from the application server. S3/CDN is deferred to a future phase.
- Q: Are generation jobs persisted to DB or tracked in-memory only? → A: Persisted to database — Generation Job is a DB entity; on worker restart, incomplete jobs resume polling.
- Q: What is the asset retention and cleanup policy? → A: No automatic cleanup in Phase 1 — assets persist indefinitely; operators manage disk manually.
- Q: What happens when the concurrency queue overflows? → A: Unbounded queue — all excess requests queue indefinitely until a slot opens.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Local Asset Storage with HTTP Serving (Priority: P1)

A campaign creator generates media assets (images, audio, video, 3D models) during a campaign workflow. When any skill handler produces an asset, the system saves it to the local filesystem organized by tenant and run, and returns an HTTP URL served by the application. The creator previews the campaign and all assets load from the local server. Assets persist on disk across application restarts.

**Why this priority**: Without persistent storage, all generated assets are lost. This is the foundation every other media feature depends on — no provider integration works without a place to store and serve the results.

**Independent Test**: Can be fully tested by saving a sample file through the storage service and verifying it is retrievable via an HTTP URL with correct Content-Type headers. Delivers value by enabling persistent asset delivery.

**Acceptance Scenarios**:

1. **Given** a skill handler has generated an image file, **When** it saves the file to the storage service, **Then** the file is stored on the local filesystem organized by tenant and run, and an HTTP URL is returned
2. **Given** a previously saved asset, **When** the application restarts and the HTTP URL is accessed, **Then** the asset loads successfully with correct Content-Type headers
3. **Given** a 3D model (GLB) is saved, **When** accessed via HTTP URL in a Three.js application, **Then** the model loads correctly with proper CORS headers enabling cross-origin WebGL rendering
4. **Given** two identical files (same content), **When** both are saved, **Then** the system detects the duplicate via content hash and avoids storing the file twice

---

### User Story 2 - Video Generation from Text and Images (Priority: P1)

A campaign workflow step needs a short intro video or outcome animation. The skill handler sends a text prompt (and optionally a reference image or 3D render) to the video generation provider. The system submits the job, polls for completion, downloads the result, stores it on the local filesystem, and returns an HTTP URL to the workflow. The generated video matches the requested duration, resolution, and aspect ratio.

**Why this priority**: Video is the highest-impact visual asset for campaigns. Intro videos and outcome animations are central to the end-user experience. The async generation pattern established here is reused by all other providers.

**Independent Test**: Can be fully tested by sending a text prompt to the video provider, waiting for generation, and verifying the resulting MP4 is valid and stored on the local filesystem. Delivers a complete campaign intro video.

**Acceptance Scenarios**:

1. **Given** a text prompt describing a campaign scene, **When** the generate_intro_video_loop skill runs, **Then** a valid MP4 video is generated matching the requested duration (4-15 seconds) and resolution (up to 1080p)
2. **Given** a reference image of a 3D-rendered game scene, **When** image-to-video generation is requested, **Then** the resulting video animates the provided image with the campaign's visual style
3. **Given** a video generation job is submitted, **When** the provider takes longer than 5 minutes, **Then** the system times out gracefully and reports a timeout error to the workflow
4. **Given** the generation completes successfully, **When** the provider returns the video URL, **Then** the system downloads it and saves to the local filesystem before the provider URL expires

---

### User Story 3 - AI Audio Generation for Game Campaigns (Priority: P1)

A campaign workflow needs background music and sound effects for a 3D game. The system automatically routes audio requests to the appropriate provider: short sound effects (button clicks, spins, wins) go to the fast SFX provider, while longer background music tracks go to the music generation provider. Each generated audio file is stored on the local filesystem and linked to the campaign run.

**Why this priority**: Audio is essential for immersive 3D game experiences. The dual-provider routing pattern ensures optimal quality for each audio type, and the adapter interface allows provider swapping without changing skill code.

**Independent Test**: Can be fully tested by requesting an SFX generation (short click sound) and a BGM generation (30-second ambient track), verifying both return valid audio files stored on the local filesystem. Delivers complete audio for a game campaign.

**Acceptance Scenarios**:

1. **Given** a request for a sound effect (type: sfx), **When** the audio skill runs, **Then** the system routes to the SFX provider and returns a short audio clip (0.5-5 seconds) within 30 seconds
2. **Given** a request for background music (type: bgm) with style "electronic", **When** the audio skill runs, **Then** the system routes to the music provider and returns a track of the requested duration (30-120 seconds)
3. **Given** a BGM request with instrumental mode enabled, **When** the music is generated, **Then** the resulting track contains no vocals
4. **Given** the primary provider for an audio type fails, **When** fallback is configured, **Then** the system attempts the secondary provider before reporting an error
5. **Given** multiple concurrent audio requests from the same tenant, **When** the concurrency limit (2 per provider) is reached, **Then** additional requests are queued rather than rejected

---

### User Story 4 - 3D Model and Texture Generation (Priority: P2)

A campaign workflow needs branded 3D assets for a Three.js game scene — a prize wheel, card models, a stage, or branded logo models. The skill handler sends a text prompt (or reference image) to the 3D model provider. The system generates a GLB model with PBR materials, downloads it, stores it on the local filesystem, and returns an HTTP URL. Separately, 2D textures and environment maps can be generated for materials and scene lighting.

**Why this priority**: 3D models make campaigns visually unique. However, 3D generation has longer processing times (up to 10 minutes) and higher costs than other media types. The system also supports 2D texture generation as a faster alternative for simpler visual needs.

**Independent Test**: Can be fully tested by sending a text prompt to generate a 3D model, verifying the resulting GLB loads in Three.js with correct PBR materials. Delivers a branded 3D asset for a game scene.

**Acceptance Scenarios**:

1. **Given** a text prompt describing a 3D object (e.g., "metallic gold prize wheel"), **When** the generate_3d_asset skill runs, **Then** a GLB model is generated with PBR materials (metalness, roughness, normal maps, base color) under 50k triangles
2. **Given** a brand logo image, **When** image-to-3D generation is requested, **Then** a recognizable 3D model is created from the reference image
3. **Given** a text prompt for a seamless texture, **When** 2D texture generation runs, **Then** the resulting image tiles without visible seams at the requested resolution
4. **Given** a 3D generation job, **When** it takes longer than 10 minutes, **Then** the system times out and reports a clear error to the workflow
5. **Given** a request for an HDRI environment map, **When** generation completes, **Then** the map loads correctly in Three.js for scene lighting and reflections

---

### User Story 5 - Secure Multi-Tenant Asset Isolation (Priority: P2)

Each tenant's generated assets are stored in isolated directory paths on the local filesystem. The HTTP serving layer enforces tenant-scoped access — requests are validated against the authenticated tenant's context. One tenant cannot access or enumerate another tenant's assets. An operator can monitor storage usage per tenant for billing purposes.

**Why this priority**: Multi-tenancy security is a non-negotiable requirement for a production SaaS platform. Without tenant isolation, the system cannot be safely deployed.

**Independent Test**: Can be fully tested by saving assets for two different tenants and verifying that HTTP requests authenticated as tenant A cannot access tenant B's asset paths. Delivers secure, production-ready asset isolation.

**Acceptance Scenarios**:

1. **Given** assets saved by tenant A, **When** an HTTP request authenticated as tenant B attempts to access tenant A's asset path, **Then** access is denied
2. **Given** assets for multiple tenants, **When** an operator queries storage metrics, **Then** usage is reported per tenant for billing analysis

---

### User Story 6 - Provider Cost Tracking and Rate Limiting (Priority: P2)

Every media generation request (video, audio, image, 3D model) tracks the cost incurred from the external provider. The system enforces per-tenant concurrency limits to prevent runaway API spend. Operators can review cost data to monitor expenditure and bill tenants appropriately.

**Why this priority**: Without cost tracking and rate limiting, a single tenant could exhaust the entire platform's API budget. This is essential for operational sustainability.

**Independent Test**: Can be fully tested by running a generation request and verifying cost data is logged in the run step's debug output. Delivers cost visibility and spend control.

**Acceptance Scenarios**:

1. **Given** a video generation request, **When** the generation completes, **Then** the estimated cost is recorded in the run step debug output
2. **Given** a tenant has reached the maximum concurrent generation limit for a provider, **When** another request arrives, **Then** the request is queued until a slot becomes available
3. **Given** generation requests across all providers for a tenant, **When** an operator reviews cost data, **Then** costs are broken down by provider type and generation parameters

---

### Edge Cases

- What happens when a local filesystem write fails (disk full, permissions)? The system retries up to 3 times before failing the step with a clear error indicating the storage issue.
- What happens when a provider returns an invalid or corrupted file? The system validates file integrity (correct MIME type, non-zero size) before storing and reports a PROVIDER_ERROR if validation fails.
- What happens when a provider's temporary URL expires before the system downloads the result? The system downloads immediately upon job completion; if the download fails, it retries or re-requests the URL.
- What happens when a 3D model exceeds the triangle budget? The generation request specifies the target polycount constraint; if the result exceeds it, it is flagged in debug output for manual review.
- What happens when two concurrent saves of the same file occur? Content-hash deduplication ensures only one copy is stored; the second save detects the existing hash and returns the existing HTTP URL.
- What happens when the worker crashes while polling a generation job? The job is persisted in the database; on restart, the system queries for incomplete jobs and resumes polling. If the provider job has already completed or timed out, the system handles the final state accordingly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST save generated assets to the local filesystem organized by tenant and run ID, with a directory structure of `{baseDir}/{tenantId}/{runId}/{artifactType}/{filename}`
- **FR-002**: System MUST serve assets via HTTP with proper Content-Type headers for all supported media formats (image, video, audio, 3D model, texture, environment map, shader, bundle)
- **FR-003**: System MUST enforce tenant-scoped asset access — the HTTP serving layer validates that the requesting tenant can only access their own assets
- **FR-004**: System MUST calculate SHA256 content hashes for saved assets and skip re-save when a matching hash already exists
- **FR-005**: System MUST configure CORS headers (`Cross-Origin-Resource-Policy: cross-origin`) on the asset serving endpoint to enable WebGL asset loading across origins
- **FR-006**: System MUST use content-hash-based filenames for deduplication and cache-friendly serving
- **FR-007**: System MUST generate video from text prompts with configurable duration (4-15 seconds), resolution (up to 1080p), aspect ratio (16:9, 9:16, 1:1), and optional reference image input
- **FR-008**: System MUST generate video with loop mode for seamless looping intro videos
- **FR-009**: System MUST generate short-form sound effects (0.5-5 seconds) from descriptive text prompts, supporting game interaction types (click, spin, flip, scratch, match, win, lose, countdown, reveal, confetti)
- **FR-010**: System MUST generate background music tracks from text prompts with genre/style specification (electronic, orchestral, rock, jazz, ambient, pop, hip-hop), configurable duration (30-120 seconds), and instrumental mode
- **FR-011**: System MUST automatically route audio requests to the appropriate provider based on audio type: SFX to the fast provider, BGM to the music provider
- **FR-012**: System MUST generate 3D models from text prompts in GLB format with PBR materials (metalness, roughness, normal maps, base color), optimized for real-time rendering (under 50k triangles)
- **FR-013**: System MUST generate 3D models from reference images (image-to-3D)
- **FR-014**: System MUST generate 2D images and textures at configurable resolutions (512x512 to 4096x4096) with seamless tiling support
- **FR-015**: System MUST generate HDRI environment maps for scene lighting and reflections
- **FR-016**: All media providers MUST implement the same adapter interface, allowing providers to be swapped without changing skill handler code
- **FR-017**: System MUST handle async generation jobs with polling, supporting provider-specific intervals and timeouts (video: 5s/300s, SFX: 2s/30s, BGM: 5s/180s, 3D: 10s/600s, 2D image: 2s/60s). Generation jobs MUST be persisted to the database so that incomplete jobs are recovered and polling resumes after worker restart
- **FR-018**: System MUST download generated assets from provider temporary URLs and save to local filesystem before provider URLs expire
- **FR-019**: System MUST enforce per-tenant concurrency limits per provider (video: 2, SFX: 2, BGM: 2, 3D: 2, 2D: 5). Requests exceeding the limit MUST be queued unbounded until a slot becomes available
- **FR-020**: System MUST track generation cost per request per provider and log it to run step debug output
- **FR-021**: System MUST implement retry logic for local filesystem write failures
- **FR-022**: System MUST implement provider fallback — if the primary provider fails, attempt the secondary provider when configured
- **FR-023**: System MUST update the existing Artifact entity's `uri` field to store the local HTTP URL after saving

### Key Entities

- **Artifact**: Represents a generated media asset. Key attributes: URI (local HTTP URL), content hash (SHA256), MIME type, file size, artifact type (image, video, audio, model_3d, texture, environment_map, shader, bundle), associated tenant and run
- **Provider Adapter**: Abstraction over external media generation APIs. Key attributes: provider name, supported media types, configuration (API key, base URL, timeouts, concurrency limits), cost-per-request tracking
- **Generation Job**: Represents an in-progress async media generation request, persisted to the database. Key attributes: provider job ID, status (pending, processing, completed, failed, timed out), creation timestamp, polling interval, timeout threshold, associated run step and tenant. On worker restart, incomplete jobs (status: pending or processing) are recovered and polling resumes

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All generated assets persist across application restarts and are accessible via HTTP URLs
- **SC-002**: 3D assets (GLB models, textures, HDRI maps) load and render correctly in Three.js across all supported browsers
- **SC-003**: Video generation completes within 5 minutes for standard requests (5-15 second clips at 1080p)
- **SC-004**: Sound effect generation completes within 30 seconds per effect
- **SC-005**: Background music generation completes within 3 minutes per track
- **SC-006**: 3D model generation completes within 10 minutes per model
- **SC-007**: Duplicate assets (identical content) are detected and deduplicated, reducing storage usage by at least 20% for campaigns with shared assets
- **SC-008**: No tenant can access another tenant's assets through the HTTP serving layer
- **SC-009**: Generation costs are tracked with per-request granularity and reportable per tenant per provider
- **SC-010**: All media providers can be swapped by changing configuration alone, without modifying skill handler code
- **SC-011**: The system handles provider failures gracefully — a single provider outage does not block the entire workflow when fallback is configured
- **SC-012**: Concurrent generation requests within tenant limits complete without throttling errors from external providers

## Assumptions

- Assets are stored on the local filesystem and served via the application's HTTP server; S3/CDN migration is deferred to a future phase
- The storage base directory is configurable via environment variable (e.g., `ASSET_STORAGE_DIR`)
- Provider API keys (Nano Banana, Suno, Meshy AI) will be provisioned and configured via environment variables before deployment
- The existing Artifact entity in the DAO layer already has the necessary schema to store asset URLs (the `uri` field)
- Provider temporary URLs remain valid for at least 10 minutes after generation completes, giving sufficient time for download and save
- The existing provider adapter pattern (referenced in specs) defines the interface contract that all media providers must implement
- 3D model generation quality from text prompts is sufficient for real-time game use cases without manual post-processing
- All Three.js game templates already support loading assets from remote URLs rather than local filesystem paths
- The storage abstraction layer is designed so that swapping to S3/CDN in a future phase requires only a new storage adapter implementation, not changes to skill handler code
- No automatic asset cleanup or retention policy in Phase 1 — assets persist indefinitely on disk; automatic lifecycle management (time-based or run-based deletion) is deferred to a future phase
