# Research: Provider Adapters

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Date**: 2026-01-18

## Executive Summary

This research validates the technical approach for implementing Provider Adapters (thin wrappers for media generation APIs). Key findings:

1. **Adapter Pattern**: Industry-standard for wrapping external APIs with minimal coupling
2. **Registry Pattern**: Strategy + Factory service recommended (matches existing `SkillCatalogService`)
3. **First Provider**: Stability AI via LiteLLM - best integration, cost-effective, simple sync API
4. **Package Location**: `common/src/providers/` for shared access across services

---

## 1. Provider Pattern Analysis

### Decision: Thin Adapter Pattern
**Rationale**: Keep adapters thin - no business logic, only interface adaptation and data normalization

**Key Principles**:
- Type everything with explicit interfaces for both external API and internal domain
- Centralize adapter logic - don't scatter conversion helpers
- Make adapters composable and independently testable
- No automatic retry - let callers handle retry strategy

**Benefits**:
- **Scalability**: Add new providers by implementing interface without modifying core logic
- **Flexibility**: Switching providers is configuration change only
- **Testability**: Each adapter is self-contained unit
- **Decoupling**: Code decoupled from external libraries

**Alternatives Considered**:

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Thin Adapters | Simple, testable, follows SRP | Minimal normalization only | ✅ Selected |
| Fat Service Wrappers | More features | Business logic creep, hard to test | Rejected |
| Direct API Calls | No abstraction overhead | Vendor lock-in, code duplication | Rejected |

---

## 2. Registry Pattern Analysis

### Decision: Strategy Pattern with Factory Service
**Rationale**: Explicit factory/registry service matches existing codebase patterns (`SkillCatalogService`)

**Implementation Pattern**:
```typescript
// 1. Interface for all providers of a type
export interface ImageProviderAdapter {
  generateImage(params: ImageGenerationParams): Promise<ImageProviderResult>;
}

// 2. Concrete implementations with @Injectable()
@Injectable()
export class StabilityAdapter implements ImageProviderAdapter { }

// 3. Factory/Registry service
@Injectable()
export class ImageProviderRegistry {
  getProvider(providerName: string): ImageProviderAdapter;
  getDefaultProvider(): ImageProviderAdapter;
  listProviders(): string[];
}
```

**Alternatives Considered**:

| Pattern | Pros | Cons | Verdict |
|---------|------|------|---------|
| Strategy + Factory | Type-safe, DI-native, matches codebase | Explicit registration | ✅ Selected |
| Symbol Multi-Provider | Advanced DI feature | Runtime lookup complexity | Considered for future |
| Dynamic Module forRoot() | Dynamic config | Over-engineered for MVP | Rejected |

---

## 3. First Image Provider Selection

### Decision: Stability AI (sd3.5-large)
**Rationale**: Best LiteLLM support, most cost-effective, simplest API integration

**Evaluation Matrix**:

| Provider | LiteLLM Support | Cost | API Complexity | Verdict |
|----------|----------------|------|----------------|---------|
| **Stability AI** | ✅ Dedicated docs, direct API | $0.01/credit | Sync, simple | ✅ First |
| DALL-E 3 | ✅ Well supported | $0.04-0.12/image | Sync | Second |
| Replicate | ⚠️ May need custom | Variable | Async with polling | Later |
| Fal AI | ⚠️ Newer | Fast | Newer provider | Evaluate later |

**Stability AI Advantages**:
1. **Direct REST API** via LiteLLM (no proxy complexity)
2. **OpenAI-compatible response format** (easier normalization)
3. **Advanced features**: negative_prompt, seed for reproducibility
4. **Model variety**: sd3, sd3.5-large, sd3.5-large-turbo, stable-image-ultra
5. **Cost-effective**: ~10x cheaper than DALL-E 3

**LiteLLM Integration**:
```typescript
// Already supported by existing LiteLLMHttpClient
const response = await litellmClient.imageGeneration({
  model: 'stability/sd3.5-large',
  prompt: 'A futuristic city at sunset',
  size: '1024x1024',
  negative_prompt: 'blurry, low quality',
  seed: 42,
});
// Returns: { created, data: [{ url, revised_prompt }] }
```

---

## 4. Existing Codebase Patterns

### LiteLLM Client Reference
**Location**: `common/src/llm/litellm-http.client.ts`

The existing `LiteLLMHttpClient` demonstrates the thin wrapper pattern:
- Injectable service wrapping HTTP calls
- Methods for each operation type (chatCompletion, imageGeneration, videoGeneration, etc.)
- Uses fetch API with Bearer token auth
- Logs extensively with context
- Throws errors directly (no Result wrapper)

**Factory Pattern**: `LiteLLMClientFactory` handles configuration-based instantiation

### Skill Result Pattern
**Location**: `dto/src/skills/skill-result.interface.ts`

Skills return `SkillResult<T>` with:
- `ok: boolean` - success indicator
- `data?: T` - output when successful
- `error?: string` - error message
- `error_code?: string` - typed error code
- `artifacts: SkillArtifact[]` - generated artifacts with URI and metadata
- `debug: SkillDebugInfo` - timing, provider calls, etc.

Provider adapters should return simple `{ uri, metadata }` format - skills wrap in `SkillResult`.

### Exception Handling
**Location**: `agent-platform/src/skills/skill-runner/exceptions/`

Custom exceptions extend `SkillException` with:
- Error type (INPUT_VALIDATION, OUTPUT_VALIDATION, EXECUTION, etc.)
- Error code (typed enum)
- Structured details for debugging

Provider adapters should throw `ProviderError` (to be created) extending this pattern.

---

## 5. Package Location Decision

### Decision: `common/src/providers/`
**Rationale**: Provider adapters are infrastructure shared by multiple services

**Monorepo Hierarchy**:
```
dto (interfaces, request/response types)
  ↓
common (provider adapters, shared services)
  ↓
agent-platform (skill handlers that consume providers)
```

**File Structure**:
```
common/src/providers/
├── index.ts                    # Barrel export
├── interfaces/
│   ├── image-provider.interface.ts
│   ├── video-provider.interface.ts
│   ├── audio-provider.interface.ts
│   ├── asset3d-provider.interface.ts
│   └── segmentation-provider.interface.ts
├── adapters/
│   ├── stability.adapter.ts    # First implementation
│   └── dalle.adapter.ts        # Phase 2
├── registries/
│   └── image-provider.registry.ts
├── errors/
│   └── provider.error.ts
└── providers.module.ts
```

**Alternative Considered**:
- Placing in `agent-platform/src/providers/` - Rejected because future API endpoints may need providers

---

## 6. Error Handling Strategy

### Decision: No Automatic Retry - Immediate Error Return
**Rationale**: Simpler implementation, clear error boundaries, caller decides retry strategy

**Implementation**:
```typescript
async generateImage(params): Promise<ImageProviderResult> {
  try {
    const response = await this.litellmClient.imageGeneration(request);
    return this.normalizeResponse(response);
  } catch (error) {
    // Log and re-throw immediately - no retry
    this.logger.error(`Provider ${this.providerName} failed: ${error.message}`);
    throw new ProviderError(this.providerName, error.message, error.code);
  }
}
```

**Error Types**:
- `PROVIDER_UNAVAILABLE` - API unreachable
- `AUTHENTICATION_ERROR` - Invalid credentials (don't expose details)
- `RATE_LIMITED` - Too many requests
- `GENERATION_FAILED` - Provider returned error
- `INVALID_PARAMS` - Unsupported parameters

---

## 7. Interface Design

### Core Interfaces (to be placed in dto package)

```typescript
// dto/src/providers/generation-params.interface.ts
export interface GenerationParams {
  prompt: string;
  format?: string;
  negativePrompt?: string;
  durationSec?: number;
  resolution?: string;
  seed?: number;
  inputUris?: string[];
  brandAssets?: string[];
}

// dto/src/providers/generation-result.interface.ts
export interface GenerationResult {
  /** URI to provider-hosted content */
  uri: string;
  /** Normalized metadata */
  metadata: ProviderMetadata;
}

export interface ProviderMetadata {
  providerId: string;
  model: string;
  durationSec?: number;
  resolution?: string;
  costUsd?: number;
  rawResponse?: unknown;
}

// dto/src/providers/image-provider.interface.ts
export interface ImageGenerationParams extends GenerationParams {
  width?: number;
  height?: number;
  aspectRatio?: string;
  numImages?: number;
  quality?: 'standard' | 'hd';
  style?: string;
}

export interface ImageProviderAdapter {
  readonly providerId: string;
  generateImage(params: ImageGenerationParams): Promise<GenerationResult>;
}
```

---

## 8. Implementation Phases

### Phase 1: MVP (P1 Stories)
1. Create interfaces in `dto/src/providers/`
2. Implement `StabilityAdapter` in `common/src/providers/adapters/`
3. Create `ImageProviderRegistry` with single provider
4. Unit tests for adapter
5. Update one skill to use provider registry

### Phase 2: Validation (P1 Complete)
6. Implement `DalleAdapter` (validates multi-provider pattern)
7. Add default provider configuration
8. Integration tests across providers
9. Sample skill demonstrating provider abstraction

### Phase 3: Expansion (P2/P3 Stories)
10. Video provider interface + adapter
11. Audio provider interface + adapter
12. 3D and Segmentation providers

---

## 9. Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Provider API changes | Medium | High | Thin adapters isolate changes, unit tests catch breaks |
| Rate limiting | Medium | Medium | LiteLLM handles internally, track in debug info |
| Provider downtime | Low | High | Multi-provider registry enables fallback at skill level |
| Cost overruns | Medium | Medium | Track via provider_calls debug, set up monitoring |
| Response format variations | Medium | Medium | Comprehensive normalization tests |

---

## 10. References

### Codebase References
- LiteLLM Client: `common/src/llm/litellm-http.client.ts`
- LiteLLM Factory: `common/src/llm/litellm-client.factory.ts`
- Skill Result: `dto/src/skills/skill-result.interface.ts`
- Handler Example: `agent-platform/src/skills/handlers/generate-intro-image.handler.ts`
- Exception Base: `agent-platform/src/skills/skill-runner/exceptions/skill.exception.ts`

### External Documentation
- [LiteLLM Image Generation Docs](https://docs.litellm.ai/docs/image_generation)
- [LiteLLM Stability AI Provider](https://docs.litellm.ai/docs/providers/stability)
- [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)
- [TypeScript Adapter Pattern](https://refactoring.guru/design-patterns/adapter/typescript/example)
