# Implementation Plan: Provider Adapters

**Branch**: `003-provider-adapters` | **Date**: 2026-01-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-provider-adapters/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create a minimal provider abstraction layer enabling Skills to call media generation APIs (image, video, audio, 3D, segmentation) without vendor coupling. Implementation provides thin wrappers that normalize only essential outputs (uri + metadata), a ProviderRegistry for dependency injection, and at least one concrete image provider adapter (e.g., Stability AI, DALL-E, or Replicate via LiteLLM). Follows existing LiteLLMHttpClient patterns in common package.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20.x (matches existing codebase)
**Primary Dependencies**: NestJS 11.x, class-validator, class-transformer, existing LiteLLMHttpClient
**Storage**: N/A (provider-hosted URLs returned directly, no platform storage layer)
**Testing**: Jest (unit tests), existing skill execution framework for integration tests
**Target Platform**: Linux server (Docker containers), development on macOS
**Project Type**: Monorepo library (common package) + skill consumers (agent-platform)
**Performance Goals**: <500ms additional latency over underlying provider API calls (SC-004)
**Constraints**: No automatic retry (caller handles), thin wrappers only, provider-hosted URLs
**Scale/Scope**: 5 provider types, 1 concrete implementation (image), registry with default provider support

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

<!--
  Reference: .specify/memory/constitution.md v1.0.0
  Verify each principle below. Mark PASS, FAIL (with justification), or N/A.
-->

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec exists at /specs/003-provider-adapters/spec.md with full requirements |
| II. Type Safety & Schema Validation | PASS | Will use TypeScript strict mode, class-validator DTOs for request/response objects |
| III. Multi-Tenant First | N/A | Provider adapters are system-level infrastructure; no tenant-scoped data storage. TenantId passed in context for logging/cost tracking only |
| IV. Monorepo Discipline | PASS | Interfaces in dto, implementations in common, consumers in agent-platform. Follows dto→common→agent-platform hierarchy |
| V. Error Handling & Observability | PASS | Will use error objects with provider/model details, NestJS Logger for structured logging with correlation IDs |

## Project Structure

### Documentation (this feature)

```text
specs/003-provider-adapters/
├── spec.md              # Feature specification
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output - design decisions and research
├── data-model.md        # Phase 1 output - interface definitions
├── quickstart.md        # Phase 1 output - implementation guide
├── contracts/           # Phase 1 output - TypeScript interface contracts
│   ├── README.md
│   ├── image-provider.contract.ts
│   ├── video-provider.contract.ts
│   ├── audio-provider.contract.ts
│   ├── asset3d-provider.contract.ts
│   ├── segmentation-provider.contract.ts
│   └── provider-registry.contract.ts
├── checklists/
│   └── requirements.md  # Specification quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Monorepo structure - Provider Adapters additions

dto/src/providers/           # NEW: Provider interfaces and types
├── index.ts                 # Barrel export
├── types/
│   ├── index.ts
│   ├── generation-params.interface.ts    # GenerationParams, GenerationResult
│   └── provider-error.interface.ts       # ProviderErrorCode, ProviderErrorDetails
└── interfaces/
    ├── index.ts
    ├── image-provider.interface.ts       # ImageProviderAdapter
    ├── video-provider.interface.ts       # VideoProviderAdapter
    ├── audio-provider.interface.ts       # AudioProviderAdapter
    ├── asset3d-provider.interface.ts     # Asset3DProviderAdapter
    ├── segmentation-provider.interface.ts # SegmentationProviderAdapter
    └── provider-registry.interface.ts    # ProviderRegistry

common/src/providers/        # NEW: Provider implementations
├── index.ts                 # Barrel export
├── adapters/
│   ├── index.ts
│   └── stability.adapter.ts            # First concrete implementation
├── registries/
│   ├── index.ts
│   └── image-provider.registry.ts      # Image provider registry
├── errors/
│   ├── index.ts
│   └── provider.error.ts               # ProviderError class
└── providers.module.ts                 # NestJS module

agent-platform/src/skills/handlers/     # EXISTING: Skill handlers consume providers
└── [handlers import ImageProviderRegistry from common]
```

**Structure Decision**: Monorepo library pattern - interfaces in `dto` package (lowest dependency level), implementations in `common` package (shared infrastructure), consumed by `agent-platform` skill handlers. Follows existing `dto→common→agent-platform` hierarchy.

## Constitution Check (Post-Design)

*Re-evaluated after Phase 1 design completion.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Full specification, research, data model, contracts, and quickstart completed |
| II. Type Safety & Schema Validation | PASS | All interfaces defined with TypeScript strict typing; class-validator for DTOs; ProviderErrorCode enum for typed errors |
| III. Multi-Tenant First | N/A | System-level infrastructure; no tenant-scoped data. TenantId available in skill context for logging/cost tracking |
| IV. Monorepo Discipline | PASS | Interfaces in dto, implementations in common, consumers in agent-platform. No cross-service imports between api-center and agent-platform |
| V. Error Handling & Observability | PASS | ProviderError class with typed codes, debug context; NestJS Logger integration; metadata includes provider_id, model, cost_usd |

## Complexity Tracking

> No constitution violations. Design follows existing patterns (LiteLLMHttpClient, SkillCatalogService) with minimal additions.

| Pattern Used | Justification | Simpler Alternative |
|--------------|---------------|---------------------|
| Strategy + Factory Registry | Matches existing SkillCatalogService pattern | Direct instantiation would prevent swapping providers |
| Interface segregation (5 provider types) | Each media type has distinct parameters | Single generic interface would lose type safety |
| ProviderError class | Consistent error handling across adapters | Plain Error would lose structured debug info |
