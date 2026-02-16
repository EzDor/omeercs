# Implementation Plan: Campaign Intelligence

**Branch**: `013-campaign-intelligence` | **Date**: 2026-02-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-campaign-intelligence/spec.md`
**User Directive**: Backend (api-center) + AI platform (agent-platform) focus. Minimal test UI only.

## Summary

Add AI-powered campaign intelligence features: (1) campaign plan generation from natural language briefs with confidence scoring and prize recommendations, (2) marketing copy generation with tone control, character limits, and compliance warnings, (3) theme extraction from text briefs via LLM mood analysis, and (4) theme extraction from uploaded images via dominant color clustering. All generations are persisted with full history. The existing skills infrastructure (prompt registry, LLM generation service, schema validation) is leveraged for LLM-based features. A new `AiGeneration` entity tracks all generation history linked to campaigns. Communication between api-center and agent-platform uses synchronous HTTP for <10s intelligence calls.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 20+
**Primary Dependencies**: NestJS 10, TypeORM, class-validator, Ajv, sharp (image processing), LiteLLM proxy (LLM abstraction)
**Storage**: PostgreSQL 17 (pgvector), schema `app`; existing `StorageService` for image uploads
**Testing**: Jest (agent-platform, api-center), Vitest (webapp)
**Target Platform**: Linux server (Docker), browser for minimal test UI
**Project Type**: Monorepo (existing pnpm workspace)
**Performance Goals**: Plan generation <10s, copy generation <5s, theme extraction <5s, image processing <5s
**Constraints**: LLM retry up to 2x on validation failure, WCAG AA 4.5:1 contrast ratio enforcement
**Scale/Scope**: Multi-tenant, per-campaign generation history, 2000-char brief limit

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` v1.0.0

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec at `/specs/013-campaign-intelligence/spec.md`, clarifications completed |
| II. Type Safety & Schema Validation | PASS | TypeScript strict, class-validator DTOs for all endpoints, Ajv for LLM output validation, JSON Schema for prompt vars |
| III. Multi-Tenant First | PASS | New `AiGeneration` entity includes `tenantId`, all endpoints use `TenantContextInterceptor` |
| IV. Monorepo Discipline | PASS | DTOs in `dto/`, utilities in `common/`, entities in `dao/`, API in `api-center/`, AI logic in `agent-platform/` |
| V. Error Handling & Observability | PASS | Result objects for LLM failures, structured logging with correlation IDs, retry with timing metrics |

**Post-Design Re-Check (Phase 1)**: All principles verified after design artifacts generated. No changes — AiGeneration entity includes tenantId (III), all packages respect dependency hierarchy (IV), error/retry patterns in contracts match constitution requirements (V).

## Project Structure

### Documentation (this feature)

```text
specs/013-campaign-intelligence/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── plan-generation.contract.md
│   ├── copy-generation.contract.md
│   ├── theme-extraction.contract.md
│   └── theme-presets.contract.md
└── tasks.md
```

### Source Code (repository root)

```text
dto/src/
└── intelligence/
    ├── plan-generation.dto.ts          # Plan generation request/response DTOs
    ├── copy-generation.dto.ts          # Copy generation request/response DTOs
    ├── theme-extraction.dto.ts         # Theme extraction request/response DTOs
    ├── theme-presets.dto.ts            # Theme preset response DTOs
    └── intelligence-enums.ts           # Shared enums: CopyType, CopyTone, ThemeMood, GenerationType

dao/src/
├── entities/
│   └── ai-generation.entity.ts         # Generation history entity (multi-tenant)
└── migrations/
    └── XXXXXXXXX-CreateAiGenerationTable.ts

common/src/
└── intelligence/
    ├── intelligence.module.ts
    ├── wcag-contrast.util.ts           # WCAG AA contrast ratio calculation + adjustment
    ├── copy-compliance.util.ts         # Regulatory keyword flagging
    └── theme-presets.ts                # Static industry theme presets data

agent-platform/src/
└── intelligence/
    ├── intelligence.module.ts          # NestJS module for intelligence services
    ├── intelligence.controller.ts      # Internal HTTP endpoints (called by api-center)
    ├── services/
    │   ├── intelligence-plan.service.ts    # Plan generation: prompt → LLM → validate → return
    │   ├── copy-generation.service.ts      # Copy generation: prompt → LLM → validate → compliance check
    │   ├── theme-brief.service.ts          # Theme from brief: prompt → LLM → validate → contrast check
    │   └── theme-image.service.ts          # Theme from image: sharp → k-means clustering → palette
    └── handlers/                        # Skill handlers (for future workflow integration)
        └── extract-theme-image.handler.ts

agent-platform/prompts/
├── intelligence_plan/
│   └── 1.0.0.md                        # Plan generation prompt template
├── generate_copy/
│   └── 1.0.0.md                        # Copy generation prompt template
└── extract_theme_brief/
    └── 1.0.0.md                        # Theme extraction from brief prompt template

skills/catalog/
├── intelligence_plan.yaml              # Plan from brief skill descriptor
├── generate_campaign_copy.yaml         # Copy generation skill descriptor
├── extract_theme_from_brief.yaml       # Theme from brief skill descriptor
└── extract_theme_from_image.yaml       # Theme from image skill descriptor

api-center/src/
└── intelligence/
    ├── intelligence.module.ts          # NestJS module for intelligence API
    ├── intelligence.controller.ts      # Public REST endpoints (auth, tenant context)
    └── intelligence-api.service.ts     # Orchestration: call agent-platform → persist → return

webapp/src/
├── views/
│   └── IntelligenceTestPage.vue        # Minimal test UI: forms + JSON result display
├── services/
│   └── intelligence.service.ts         # Axios HTTP client for intelligence API
└── router/
    └── (update existing routes)
```

### Architecture Decision: Service Communication

```text
User → api-center (POST /api/intelligence/*)
  → AuthGuard + TenantContextInterceptor
  → IntelligenceApiService
    → HTTP POST to agent-platform:3002/internal/intelligence/*
      → agent-platform IntelligenceService
        → PromptRegistryService (load prompt)
        → TemplateRendererService (render with variables)
        → LiteLLMHttpClient (call LLM with json_schema mode)
        → Ajv validation (validate output against schema)
        → Retry up to 2x on validation failure (FR-017)
        → Return structured result
    ← Return JSON
  → Persist AiGeneration record to DB
  → Return enriched response to user
```

**Why HTTP between services**: Intelligence calls are synchronous (<10s), low-volume (marketer-initiated), and need immediate response. BullMQ async queues are unnecessary overhead for this use case. The agent-platform's internal endpoints are not exposed externally (internal network only).

**Why not put LLM logic in api-center**: The agent-platform owns all AI/LLM infrastructure (prompt registry, template renderer, skill runner). Placing intelligence logic there maintains the monorepo discipline (Principle IV) and enables future composition into workflows.

### Key Integration Points

| Component | Integrates With | Method |
|-----------|----------------|--------|
| Intelligence API (api-center) | Agent-platform intelligence | HTTP (axios) |
| Intelligence services (agent-platform) | Prompt Registry | Direct injection |
| Intelligence services (agent-platform) | LiteLLM proxy | HTTP via LiteLLMHttpClient |
| Theme image service (agent-platform) | sharp library | Direct function call |
| WCAG contrast validation | Intelligence API + theme services | Imported utility |
| Copy compliance checker | Intelligence API + copy service | Imported utility |
| AiGeneration entity | Intelligence API service | TypeORM repository |
| Campaign entity | Intelligence plan acceptance | Existing CampaignApiService |
| Theme presets | Intelligence API (GET endpoint) | Static data import |

## Complexity Tracking

> No constitution violations. No complexity justifications needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
