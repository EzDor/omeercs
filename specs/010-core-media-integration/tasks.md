# Tasks: Core Media Integration

**Input**: Design documents from `/specs/010-core-media-integration/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification. Test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend existing enum and configure environment for new provider integrations

- [x] T001 Add MODEL_3D, TEXTURE, ENVIRONMENT_MAP to StandardArtifactTypes in `dto/src/campaign-context/standard-artifact-types.enum.ts`
- [x] T002 Add NANO_BANANA_API_KEY, SUNO_API_KEY, MESHY_API_KEY, ASSET_STORAGE_DIR to `.env.example` with placeholder values

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create GenerationJob entity in `dao/src/entities/generation-job.entity.ts` extending BaseEntity with all columns from data-model.md (id, tenant_id, run_id, run_step_id, provider_id, provider_job_id, media_type, status, poll_interval_ms, timeout_ms, attempts, input_params, result_uri, artifact_id FK, error_message, cost_usd, started_at, completed_at) and indexes (tenant_id+status, provider_id+status, run_step_id)
- [x] T004 Create DB migration in `dao/src/migrations/XXXX-CreateGenerationJobTable.ts` using the DDL from data-model.md — create app.generation_jobs table with all columns, foreign key to app.artifacts(id), and three indexes
- [x] T005 Register GenerationJob entity in the DAO module's TypeORM entity list so it is recognized by the ORM
- [x] T006 [P] Create StorageService in `common/src/storage/storage.service.ts` implementing the StorageService interface from contracts/storage.service.contract.ts — upload (SHA256 hash, write to `{ASSET_STORAGE_DIR}/{tenantId}/{runId}/{artifactType}/{hash}.{ext}`, deduplicate via exists check), exists (check Artifact table by contentHash), getHttpUrl (return `/api/media/{tenantId}/{runId}/{artifactType}/{filename}`), validateTenantAccess (path must start with tenantId segment)
- [x] T007 [P] Create StorageModule in `common/src/storage/storage.module.ts` — NestJS module importing ConfigModule and TypeOrmModule.forFeature([Artifact]), providing and exporting StorageService
- [x] T008 [P] Create ConcurrencyLimiterService in `common/src/providers/services/concurrency-limiter.service.ts` implementing the ConcurrencyLimiter interface from contracts/concurrency-limiter.contract.ts — in-memory semaphores per tenant per media type with default limits (video:2, audio_sfx:2, audio_bgm:2, model_3d:2, image:5), acquire returns a release callback, unbounded queue via promise resolution chain
- [x] T009 Create PollingService in `common/src/providers/services/polling.service.ts` implementing the PollingService interface from contracts/polling.service.contract.ts — submitAndTrack (create GenerationJob record in DB, return jobId), pollUntilComplete (loop: wait pollIntervalMs, call checkStatus callback, update DB record status/attempts/result_uri/cost_usd, break on completed/failed/timed_out, enforce timeoutMs), recoverIncompleteJobs (query DB for pending/processing jobs created within timeout window)

**Checkpoint**: Foundation ready — storage, polling, concurrency, and DB entity are in place. User story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — Local Asset Storage with HTTP Serving (Priority: P1)

**Goal**: Save generated assets to the local filesystem organized by tenant/run, serve via HTTP with correct Content-Type and CORS headers, deduplicate via content hash.

**Independent Test**: Save a sample file through StorageService, verify it exists on disk at the expected path, and access it via HTTP at `GET /api/media/{tenantId}/{runId}/image/{hash}.png` with correct headers.

### Implementation for User Story 1

- [x] T010 [US1] Create MediaController in `api-center/src/media/media.controller.ts` — authenticated endpoint `GET /api/media/:tenantId/:runId/:artifactType/:filename` that validates tenant access (requesting tenant must match :tenantId), resolves file path via `{ASSET_STORAGE_DIR}/{tenantId}/{runId}/{artifactType}/{filename}`, guards against path traversal, streams the file with correct Content-Type (reuse CONTENT_TYPES map from assets.controller.ts pattern), sets headers: Access-Control-Allow-Origin: *, Cross-Origin-Resource-Policy: cross-origin, Cache-Control: public, max-age=31536000, immutable. Returns 401/403/404/400 per contract.
- [x] T011 [US1] Create MediaModule in `api-center/src/media/media.module.ts` — NestJS module importing ConfigModule and StorageModule, registering MediaController
- [x] T012 [US1] Register MediaModule in the api-center app module so the /api/media endpoint is active

**Checkpoint**: User Story 1 is independently testable — upload a file via StorageService, request it via /api/media endpoint, verify Content-Type and CORS headers.

---

## Phase 4: User Story 2 — Video Generation from Text and Images (Priority: P1)

**Goal**: Generate video from text prompts (and optional reference images) via Nano Banana API, poll for completion, download and store locally, return HTTP URL.

**Independent Test**: Send a text prompt to NanoBananaVideoAdapter.generateVideo(), verify GenerationJob transitions pending→processing→completed, artifact stored on disk as MP4, HTTP URL accessible.

### Implementation for User Story 2

- [x] T013 [P] [US2] Create NanoBananaVideoAdapter in `common/src/providers/adapters/nano-banana-video.adapter.ts` implementing VideoProviderAdapter — providerId: 'nano-banana-video', generateVideo method: POST to Nano Banana video API with prompt, duration, resolution, aspect ratio, loop mode, optional reference image; parse response for provider job ID; return GenerationResult with provider URI and VideoGenerationMetadata (duration, resolution, fps, format). Use axios for HTTP. Read API key from ConfigService (NANO_BANANA_API_KEY).
- [x] T014 [P] [US2] Create VideoProviderRegistry in `common/src/providers/registries/video-provider.registry.ts` following the same pattern as AudioProviderRegistry — register NanoBananaVideoAdapter, support getProvider/getDefaultProvider/listProviders/hasProvider methods
- [x] T015 [US2] Register NanoBananaVideoAdapter and VideoProviderRegistry in `common/src/providers/providers.module.ts` — add to providers array and export VideoProviderRegistry

**Checkpoint**: User Story 2 is independently testable — trigger video generation, verify polling lifecycle and artifact storage.

---

## Phase 5: User Story 3 — AI Audio Generation for Game Campaigns (Priority: P1)

**Goal**: Generate SFX via Nano Banana and BGM via Suno, with automatic routing by audio type. Store results locally.

**Independent Test**: Request SFX generation (short click sound) and BGM generation (30s ambient track), verify routing to correct provider, polling lifecycle, and artifact storage.

### Implementation for User Story 3

- [x] T016 [P] [US3] Create NanoBananaSfxAdapter in `common/src/providers/adapters/nano-banana-sfx.adapter.ts` implementing AudioProviderAdapter — providerId: 'nano-banana-sfx', generateAudio method: POST to Nano Banana SFX API with prompt, duration (0.5-5s), format; parse response for provider job ID; return GenerationResult with AudioGenerationMetadata. Use axios. Read API key from ConfigService (NANO_BANANA_API_KEY).
- [x] T017 [P] [US3] Create SunoBgmAdapter in `common/src/providers/adapters/suno-bgm.adapter.ts` implementing AudioProviderAdapter — providerId: 'suno-bgm', generateAudio method: POST to Suno API with prompt, genre/style, duration (30-120s), instrumental mode; parse response for provider job ID; return GenerationResult with AudioGenerationMetadata. Use axios. Read API key from ConfigService (SUNO_API_KEY).
- [x] T018 [US3] Add type-based routing to AudioProviderRegistry in `common/src/providers/registries/audio-provider.registry.ts` — add `routeByAudioType(type: 'sfx' | 'bgm'): AudioProviderAdapter` method that returns NanoBananaSfxAdapter for 'sfx' and SunoBgmAdapter for 'bgm'; register both adapters in the constructor alongside existing StubAudioAdapter; update default provider selection based on config
- [x] T019 [US3] Register NanoBananaSfxAdapter and SunoBgmAdapter in `common/src/providers/providers.module.ts` — add to providers array

**Checkpoint**: User Story 3 is independently testable — generate SFX and BGM, verify routing and storage.

---

## Phase 6: User Story 4 — 3D Model and Texture Generation (Priority: P2)

**Goal**: Generate 3D models (GLB) via Meshy and 2D images/textures via Nano Banana. Store results locally.

**Independent Test**: Send text prompt to generate a 3D model, verify GLB file stored and accessible. Generate a 2D texture, verify stored and tiling-ready.

### Implementation for User Story 4

- [x] T020 [P] [US4] Create MeshyAsset3dAdapter in `common/src/providers/adapters/meshy-3d.adapter.ts` implementing Asset3DProviderAdapter — providerId: 'meshy', generate3DAsset method: POST to Meshy API with prompt (or reference image for image-to-3D), target polycount (<50k triangles), PBR material settings; parse response for provider job ID; return GenerationResult with Asset3DGenerationMetadata (format: glb, polycount, materials). Use axios. Read API key from ConfigService (MESHY_API_KEY).
- [x] T021 [P] [US4] Create NanoBananaImageAdapter in `common/src/providers/adapters/nano-banana-image.adapter.ts` implementing ImageProviderAdapter — providerId: 'nano-banana-image', generateImage method: POST to Nano Banana image API with prompt, resolution (512-4096), seamless tiling flag, HDRI environment map mode; parse response for provider job ID; return GenerationResult with ImageGenerationMetadata. Use axios. Read API key from ConfigService (NANO_BANANA_API_KEY).
- [x] T022 [P] [US4] Create Asset3DProviderRegistry in `common/src/providers/registries/asset3d-provider.registry.ts` following the same pattern as ImageProviderRegistry — register MeshyAsset3dAdapter, support getProvider/getDefaultProvider/listProviders/hasProvider methods
- [x] T023 [US4] Register NanoBananaImageAdapter in ImageProviderRegistry in `common/src/providers/registries/image-provider.registry.ts` — add as additional provider alongside existing StabilityAdapter, keep Stability as default unless configured otherwise via DEFAULT_IMAGE_PROVIDER
- [x] T024 [US4] Register MeshyAsset3dAdapter, NanoBananaImageAdapter, and Asset3DProviderRegistry in `common/src/providers/providers.module.ts` — add to providers array and export Asset3DProviderRegistry

**Checkpoint**: User Story 4 is independently testable — generate 3D model and 2D texture/image, verify storage and HTTP serving.

---

## Phase 7: User Story 5 — Secure Multi-Tenant Asset Isolation (Priority: P2)

**Goal**: Enforce tenant-scoped access on the media endpoint — one tenant cannot access another tenant's assets.

**Independent Test**: Save assets for tenant A and tenant B, verify tenant A's authenticated request to tenant B's path returns 403.

### Implementation for User Story 5

- [x] T025 [US5] Add tenant validation logic in MediaController `api-center/src/media/media.controller.ts` — extract authenticated tenantId from the request context (via TenantContextInterceptor / CLS), compare against the :tenantId path parameter, return 403 Forbidden if mismatch. Ensure the AuthGuard is active on the /api/media route (no @Public decorator).

**Checkpoint**: User Story 5 is independently testable — cross-tenant access returns 403, same-tenant access returns 200.

---

## Phase 8: User Story 6 — Provider Cost Tracking and Rate Limiting (Priority: P2)

**Goal**: Track generation cost per request, enforce per-tenant concurrency limits, log costs to run step debug output.

**Independent Test**: Run a generation request, verify cost_usd is populated on GenerationJob and logged in run step debug. Exceed concurrency limit, verify request queues rather than fails.

### Implementation for User Story 6

- [x] T026 [US6] Integrate ConcurrencyLimiterService into PollingService in `common/src/providers/services/polling.service.ts` — before submitting a job, call `acquire(tenantId, mediaType)` to obtain a slot; call the release callback when the job completes, fails, or times out
- [x] T027 [US6] Add cost tracking to PollingService in `common/src/providers/services/polling.service.ts` — when pollUntilComplete receives a completed status with costUsd, update the GenerationJob record and log cost to the run step debug output via the existing SkillResult.debug.provider_calls pattern

**Checkpoint**: User Story 6 is independently testable — concurrency limits enforce queuing, cost data visible in GenerationJob records and debug output.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T028 [P] Wire StorageModule import into agent-platform's module tree so skill handlers in agent-platform can use StorageService for saving generated assets
- [x] T029 [P] Add provider fallback logic to each registry (VideoProviderRegistry, AudioProviderRegistry, ImageProviderRegistry, Asset3DProviderRegistry) — if primary provider throws, attempt secondary provider when registered
- [x] T030 Implement recoverIncompleteJobs startup hook — call PollingService.recoverIncompleteJobs() on agent-platform NestJS module initialization (OnModuleInit) to resume polling for jobs left incomplete by a previous worker crash
- [x] T031 Add retry logic for filesystem write failures in StorageService `common/src/storage/storage.service.ts` — retry up to 3 times with exponential backoff on ENOSPC/EACCES/EIO errors before throwing
- [x] T032 Add file integrity validation in PollingService after downloading from provider — check MIME type matches expected media type and file size > 0 before passing to StorageService; report PROVIDER_ERROR if validation fails
- [x] T033 Run quickstart.md validation — build all workspaces in order (dto → common → dao), run migration, start services, verify storage upload and HTTP serving per quickstart steps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001 for artifact types used by adapters, T002 for env vars)
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion (T003-T009)
  - US1 (Phase 3): Depends on T006, T007 (StorageService/Module)
  - US2 (Phase 4): Depends on T009 (PollingService), T006 (StorageService)
  - US3 (Phase 5): Depends on T009 (PollingService), T006 (StorageService)
  - US4 (Phase 6): Depends on T009 (PollingService), T006 (StorageService)
  - US5 (Phase 7): Depends on US1 (T010-T012 for MediaController)
  - US6 (Phase 8): Depends on T008 (ConcurrencyLimiter), T009 (PollingService)
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependencies on other stories
- **US2 (P1)**: Can start after Foundational — no dependencies on other stories
- **US3 (P1)**: Can start after Foundational — no dependencies on other stories
- **US4 (P2)**: Can start after Foundational — no dependencies on other stories
- **US5 (P2)**: Depends on US1 (MediaController must exist to add tenant validation)
- **US6 (P2)**: Can start after Foundational — integrates into PollingService which is foundational

### Within Each User Story

- Models/entities before services
- Services before endpoints/controllers
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T001 and T002 in Phase 1 can run in parallel
- T006, T007, T008 in Phase 2 can run in parallel (different files)
- T003, T004, T005 must be sequential (entity → migration → registration)
- US1, US2, US3, US4, US6 can all start in parallel after Phase 2
- T013 and T014 in US2 can run in parallel
- T016 and T017 in US3 can run in parallel
- T020, T021, T022 in US4 can run in parallel
- T028 and T029 in Polish can run in parallel

---

## Parallel Example: Phase 2 Foundational

```bash
# These can run in parallel (different files, no dependencies on each other):
Task: "Create StorageService in common/src/storage/storage.service.ts"
Task: "Create StorageModule in common/src/storage/storage.module.ts"
Task: "Create ConcurrencyLimiterService in common/src/providers/services/concurrency-limiter.service.ts"

# These must be sequential (entity → migration → registration):
Task: "Create GenerationJob entity in dao/src/entities/generation-job.entity.ts"
Task: "Create DB migration in dao/src/migrations/XXXX-CreateGenerationJobTable.ts"
Task: "Register GenerationJob entity in DAO module"

# Then this depends on GenerationJob entity and StorageService:
Task: "Create PollingService in common/src/providers/services/polling.service.ts"
```

## Parallel Example: User Stories 2 + 3 (after Phase 2)

```bash
# US2 tasks that can run in parallel:
Task: "Create NanoBananaVideoAdapter in common/src/providers/adapters/nano-banana-video.adapter.ts"
Task: "Create VideoProviderRegistry in common/src/providers/registries/video-provider.registry.ts"

# US3 tasks that can run in parallel (and in parallel with US2):
Task: "Create NanoBananaSfxAdapter in common/src/providers/adapters/nano-banana-sfx.adapter.ts"
Task: "Create SunoBgmAdapter in common/src/providers/adapters/suno-bgm.adapter.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational — at minimum T003-T007 (GenerationJob entity + StorageService)
3. Complete Phase 3: User Story 1 (T010-T012)
4. **STOP and VALIDATE**: Upload a file via StorageService, serve via MediaController, verify headers
5. Deploy/demo if ready — persistent asset storage is live

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 (Storage + HTTP Serving) → Test independently → Deploy (MVP!)
3. Add US2 (Video Generation) → Test independently → Deploy
4. Add US3 (Audio Generation) → Test independently → Deploy
5. Add US4 (3D + Image Generation) → Test independently → Deploy
6. Add US5 (Tenant Isolation) → Test independently → Deploy
7. Add US6 (Cost Tracking + Rate Limiting) → Test independently → Deploy
8. Polish phase → Final validation

### Parallel Team Strategy

With multiple developers after Phase 2:
- Developer A: US1 (Storage + Serving) → US5 (Tenant Isolation)
- Developer B: US2 (Video) + US3 (Audio)
- Developer C: US4 (3D + Image) + US6 (Cost + Rate Limiting)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
