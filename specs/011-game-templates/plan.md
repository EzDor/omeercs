# Implementation Plan: Game Template System

**Branch**: `011-game-templates` | **Date**: 2026-02-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-game-templates/spec.md`

## Summary

Build a game template system that enables campaign creation with 4 interactive 3D game types (spin wheel, quiz, scratch card, memory match). The system defines templates via YAML manifests with config schemas and asset slot declarations, uses the Claude Agent SDK to dynamically generate Three.js game code from template specifications, assembles self-contained bundles with injected assets, and validates bundles via headless render checks before deployment. Outcomes are pre-determined server-side for prize integrity.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 20+
**Primary Dependencies**: NestJS 10, Three.js r170+, @anthropic-ai/sdk (Claude Agent SDK), GSAP, Ajv (JSON Schema validation), Puppeteer (headless validation), js-yaml
**Storage**: PostgreSQL 17 (pgvector) for entities; local filesystem (`ASSET_STORAGE_DIR`) for bundles and assets; existing `StorageService` with content-addressable storage
**Testing**: Jest (agent-platform unit/integration tests)
**Target Platform**: Linux server (bundle generation); Browser (generated bundles target Chrome, Safari, Firefox desktop + iOS Safari, Android Chrome mobile)
**Project Type**: Monorepo (existing pnpm workspaces: dto, common, dao, agent-platform, api-center, webapp)
**Performance Goals**: Generated bundles: 30fps mobile / 60fps desktop; Bundle generation pipeline: < 120s end-to-end; Headless validation: < 15s
**Constraints**: Generated bundles < 5MB uncompressed; Offline-capable after initial load; Server-side outcome determination (no prize codes in client config)
**Scale/Scope**: 4 game templates; ~15 new/modified files across dto, agent-platform, templates; 2 new skill handlers + 1 enhanced handler

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*Reference: .specify/memory/constitution.md v1.0.0*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec exists at `/specs/011-game-templates/spec.md` with clarifications, user stories, requirements, and success criteria |
| II. Type Safety & Schema Validation | PASS | Template manifests use JSON Schema for config validation via Ajv; DTOs use class-validator decorators; TypeScript strict mode throughout |
| III. Multi-Tenant First | PASS | Template manifests are system-level (shared across tenants, no tenantId needed). Generated bundles are stored per-tenant via existing `StorageService` with `tenantId` in path. Artifact entity already has `tenantId` |
| IV. Monorepo Discipline | PASS | New interfaces/DTOs in `dto/`, new services in `agent-platform/`, template manifests in `templates/games/`. Follows dto→common→dao→agent-platform hierarchy |
| V. Error Handling & Observability | PASS | Skill handlers return `SkillResult` (ok/error pattern); retry with exponential backoff on generation failures; structured logging in all new services |

## Project Structure

### Documentation (this feature)

```text
specs/011-game-templates/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: entities and data model
├── quickstart.md        # Phase 1: developer quickstart
├── contracts/           # Phase 1: API contracts
│   ├── template-manifest-schema.yaml
│   ├── bundle-game-template-input.yaml
│   └── game-complete-event.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
dto/src/
├── template-system/
│   └── template-manifest.interface.ts          # Template manifest TypeScript interfaces
└── skills/
    ├── bundle-game-template.dto.ts             # EXISTING - enhance with scene overrides
    ├── game-config.dto.ts                      # EXISTING - already has per-template mechanics
    └── generate-threejs-code.dto.ts            # NEW - code generation skill input/output

agent-platform/src/
├── template-system/
│   ├── template-system.module.ts               # NEW - NestJS module
│   ├── services/
│   │   ├── template-manifest-loader.service.ts # NEW - load/cache YAML manifests
│   │   └── template-config-validator.service.ts# NEW - Ajv-based config validation
│   └── interfaces/
│       └── template-types.ts                   # NEW - internal types
├── skills/
│   ├── handlers/
│   │   ├── bundle-game-template.handler.ts     # MODIFY - integrate manifest loading, code gen, validation
│   │   ├── generate-threejs-code.handler.ts    # NEW - Claude Agent SDK code generation
│   │   └── validate-bundle.handler.ts          # NEW - headless render validation
│   └── services/
│       └── skill-catalog.service.ts            # MODIFY - register new handlers
└── prompt-registry/
    └── prompts/
        ├── threejs-system.prompt.txt           # NEW - system prompt for code generation
        ├── spin-wheel.prompt.txt               # NEW - template-specific prompt
        ├── quiz.prompt.txt                     # NEW - template-specific prompt
        ├── scratch-card.prompt.txt             # NEW - template-specific prompt
        └── memory-match.prompt.txt             # NEW - template-specific prompt

skills/catalog/
├── bundle_game_template.yaml                   # MODIFY - update input schema
├── generate_threejs_code.yaml                  # NEW - code generation skill descriptor
└── validate_bundle.yaml                        # NEW - validation skill descriptor

templates/games/
├── spin_wheel/
│   └── manifest.yaml                           # NEW - template manifest
├── quiz/
│   └── manifest.yaml                           # NEW - template manifest
├── scratch_card/
│   └── manifest.yaml                           # NEW - template manifest
└── memory_match/
    └── manifest.yaml                           # NEW - template manifest
```

**Structure Decision**: This feature extends the existing monorepo structure. New code lives in `agent-platform/src/template-system/` (dedicated module for template manifest management) and enhances existing skill handlers. Template manifests are stored in `templates/games/` at the repo root as system-level configuration files (not tenant-specific). No new monorepo packages are needed.

## Complexity Tracking

No constitution violations. All changes fit within existing package boundaries.
