# Research: Reference Implementations

**Feature**: 009-reference-impl
**Date**: 2026-02-03

## Research Questions

### RQ-001: Stub Audio Provider Implementation Pattern

**Question**: How should we implement a stub audio provider for testing without real API calls?

**Decision**: Create `StubAudioProvider` adapter following the existing `StabilityAdapter` pattern.

**Rationale**:
- The `AudioProviderAdapter` interface already exists at `dto/src/providers/interfaces/audio-provider.interface.ts`
- The image provider pattern (`StabilityAdapter`) demonstrates the expected structure
- Stub should generate a valid audio file (WAV format) with silence or simple tone for testing
- Should match the requested duration and metadata requirements

**Implementation Details**:
```typescript
// common/src/providers/adapters/stub-audio.adapter.ts
@Injectable()
export class StubAudioProvider implements AudioProviderAdapter {
  readonly providerId = 'stub';

  async generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult> {
    // Create placeholder WAV file with requested duration
    // Return URI to generated file
  }
}
```

**Alternatives Considered**:
- Mock LiteLLM responses: Rejected - too brittle and doesn't test the full adapter path
- Use real audio provider with test credits: Rejected - adds cost and external dependency for tests

---

### RQ-002: Retry Logic for Claude JSON Generation

**Question**: Does the existing LLM generation service support automatic retry on validation failure?

**Decision**: Already implemented - use existing `LlmGenerationService.executeRetryAttempt()` mechanism.

**Rationale**:
- `LlmGenerationService` at `agent-platform/src/skills/skill-runner/services/llm-generation.service.ts` already implements:
  - `shouldRetryOnValidationFailure()` - checks config for retry enabled
  - `executeRetryAttempt()` - performs retry with validation errors context
  - `buildRetryInput()` - adds validation errors to retry prompt
  - `renderRetryPrompt()` - renders prompt with error context
- Configuration via `GenerationConfig.retryOnValidationFailure` and `maxValidationRetries`
- Template skill config uses `retry_on_validation_failure` in YAML

**Implementation Details**:
- Ensure `game_config_from_template.yaml` has `retry_on_validation_failure: true` (default)
- The `SkillRunnerService` passes this to `LlmGenerationService` at line 264

**Alternatives Considered**:
- Handler-level retry: Rejected - would duplicate existing service-level retry logic
- No retry: Rejected - FR-004 requires 1 retry attempt on validation failure

---

### RQ-003: Minimal Workflow DAG for Reference Implementation

**Question**: How should we create a minimal 4-step workflow variant for Spec 9?

**Decision**: Create `campaign.build.v1.minimal.yaml` with only the 4 reference steps.

**Rationale**:
- The full `campaign.build.v1.yaml` has 14 steps including image/video generation
- Spec 9 explicitly specifies a minimal DAG: game_config → bgm → bundle_game → manifest
- A separate workflow file allows testing the reference implementation without external providers
- Can share the same skill handlers as the full workflow

**Implementation Details**:
```yaml
# campaign.build.v1.minimal.yaml
workflow_name: campaign.build.minimal
version: "1.0.0"
description: Minimal campaign build for reference implementation testing

steps:
  - step_id: game_config
    skill_id: game_config_from_template
    depends_on: []

  - step_id: bgm
    skill_id: generate_bgm_track
    depends_on: []

  - step_id: bundle_game
    skill_id: bundle_game_template
    depends_on: [game_config, bgm]

  - step_id: manifest
    skill_id: assemble_campaign_manifest
    depends_on: [bundle_game]
```

**Alternatives Considered**:
- Modify existing workflow: Rejected - would break existing tests and expectations
- Conditional step execution: Rejected - adds complexity; separate workflow is cleaner

---

### RQ-004: Diagnostic Data Capture (FR-011)

**Question**: How should diagnostic data (input_hash, output_snapshot, duration, errors) be captured per step?

**Decision**: Leverage existing `RunStep` entity fields and `SkillResult` diagnostics.

**Rationale**:
- `RunStep` entity already has:
  - `inputHash: string` - computed by `InputHasherService`
  - `durationMs: number` - execution timing
  - `error: string` - error details
  - `status: RunStepStatus` - completion state
- `SkillResult.diagnostics` includes:
  - `timings_ms: Record<string, number>` - detailed timing breakdown
  - `provider_calls: ProviderCallInfo[]` - LLM/provider call details
- Output snapshot available via `outputArtifactIds[]` linking to `Artifact` entities

**Implementation Details**:
- `RunEngineService.updateStepStatus()` already persists most diagnostic data
- May need to add output snapshot JSON to `RunStep` or create separate diagnostic table
- Consider adding `RunStep.outputSnapshot: JSONB` column for small outputs

**Alternatives Considered**:
- Separate diagnostic table: Acceptable alternative if snapshot size is concern
- External logging system: Rejected - need in-DB for cache validation

---

### RQ-005: Trigger Payload with Placeholder Video URIs

**Question**: How should the trigger payload handle placeholder video URIs for testing?

**Decision**: Accept placeholder URIs (local paths or HTTP URLs) in trigger payload for `intro_video_uri`, `outcome_win_uri`, `outcome_lose_uri`.

**Rationale**:
- FR-010 requires support for placeholder video URIs in trigger payloads
- The `assemble_campaign_manifest` handler already validates URIs flexibly (lines 247-257)
- Local paths checked via `fs.existsSync()`; HTTP URLs accepted as-is
- For testing, can use:
  - Local file paths to test fixtures
  - HTTP URLs to static test assets
  - Data URIs for small placeholders

**Implementation Details**:
```typescript
// Trigger payload example
{
  campaign_id: "test-campaign-001",
  intro_video_uri: "/fixtures/placeholder.mp4",  // or "https://example.com/placeholder.mp4"
  outcome_videos: {
    win_video_uri: "/fixtures/win.mp4",
    lose_video_uri: "/fixtures/lose.mp4"
  },
  // ... other fields
}
```

**Alternatives Considered**:
- Generate placeholder videos: Rejected - out of scope for Spec 9; would require video provider
- Skip video validation: Rejected - would not test the full manifest assembly path

---

### RQ-006: Cache Reuse for Partial Rebuilds (US5)

**Question**: How does the existing cache mechanism support partial rebuilds?

**Decision**: Use existing `StepCacheService` with input hash-based cache keys.

**Rationale**:
- `StepCacheService` at `agent-platform/src/run-engine/services/step-cache.service.ts` provides:
  - `getCachedResult(cacheKey)` - lookup by input hash
  - `setCachedResult(cacheKey, artifactIds)` - store result
  - `invalidate(stepId, workflowName)` - manual invalidation
- Cache key = hash of step inputs (computed by `InputHasherService`)
- When inputs unchanged, cache hit returns previous artifact IDs
- `CachedStepExecutorService` integrates cache lookup into step execution

**Implementation Details**:
- For audio update scenario:
  1. `game_config` step has unchanged inputs → cache hit, reuse artifacts
  2. `bgm` step has new prompt → cache miss, re-execute
  3. `bundle_game` step depends on new `bgm` → cache miss, re-execute
  4. `manifest` step depends on new `bundle_game` → cache miss, re-execute

**Alternatives Considered**:
- Time-based cache: Rejected - input-based is more precise
- No cache: Rejected - partial rebuild is explicit requirement (SC-003)

---

## Technology Research

### NestJS Provider Registration for Stub

The stub audio provider should be registered conditionally:

```typescript
// common/src/providers/providers.module.ts
@Module({
  providers: [
    {
      provide: AudioProviderRegistry,
      useFactory: (config: ConfigService, stub: StubAudioProvider, litellm: LiteLLMHttpClient) => {
        const useStub = config.get('AUDIO_PROVIDER_STUB') === 'true';
        return new AudioProviderRegistry(useStub ? stub : new LiteLLMAudioAdapter(litellm));
      },
      inject: [ConfigService, StubAudioProvider, LiteLLMHttpClient],
    },
    StubAudioProvider,
  ],
})
```

### WAV File Generation for Stub

Simple WAV header generation for placeholder audio:

```typescript
function generateSilentWav(durationSec: number, sampleRate = 44100): Buffer {
  const numChannels = 2;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * numChannels * bytesPerSample;

  const header = Buffer.alloc(44);
  // Write WAV header fields...
  const data = Buffer.alloc(dataSize, 0); // Silence
  return Buffer.concat([header, data]);
}
```

---

## Dependencies Verification

| Dependency | Spec | Status | Notes |
|------------|------|--------|-------|
| SkillCatalogService | Spec 1 | ✅ Implemented | YAML loading, handler registration |
| SkillRunnerService | Spec 2 | ✅ Implemented | Validation, execution, artifacts |
| Provider Adapters | Spec 3 | ⚠️ Partial | Image provider complete; audio needs stub |
| RunEngineService | Spec 4 | ✅ Implemented | DAG execution, caching, step tracking |
| PromptRegistryService | Spec 5 | ✅ Implemented | Template loading, rendering |
| WorkflowRegistryService | Spec 7 | ✅ Implemented | YAML loading, versioning |
| CampaignContextService | Spec 8 | ✅ Implemented | Context creation, artifact refs |

---

## Summary of Findings

1. **Stub Audio Provider**: Implement following `StabilityAdapter` pattern; generate WAV files locally
2. **Retry Logic**: Already implemented in `LlmGenerationService`; ensure YAML config enables it
3. **Minimal Workflow**: Create separate `campaign.build.v1.minimal.yaml` with 4 steps
4. **Diagnostics**: Leverage existing `RunStep` fields; consider adding `outputSnapshot` column
5. **Placeholder URIs**: Existing manifest handler supports local paths and HTTP URLs
6. **Cache Reuse**: `StepCacheService` provides input hash-based caching
