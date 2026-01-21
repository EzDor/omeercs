# Implementation Plan: Prompt & Config Registry

**Branch**: `005-prompt-config-registry` | **Date**: 2026-01-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-prompt-config-registry/spec.md`

## Summary

Implement a centralized registry service for prompt templates, config templates, and review rubrics. The registry loads versioned templates from the filesystem at startup, provides retrieval and rendering APIs with variable substitution, and integrates with the existing SkillRunner service to record resolved prompts in run step debug data.

**Technical Approach**: Create a `PromptRegistryModule` in `agent-platform` following the existing module-service pattern (similar to `SkillCatalogService`). Use Mustache for template rendering and the existing `SchemaValidatorService` (Ajv) for JSON Schema validation. Templates are file-based (global, not tenant-scoped) and loaded at startup.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20.x (matches existing codebase)
**Primary Dependencies**: NestJS 11.x, Mustache (template rendering), Ajv (existing SchemaValidatorService), js-yaml (YAML frontmatter parsing)
**Storage**: Filesystem at startup (no database for templates); PostgreSQL for run_steps.debug storage (existing)
**Testing**: Jest (existing test framework in monorepo)
**Target Platform**: Linux server (Docker containers)
**Project Type**: Monorepo - agent-platform service
**Performance Goals**: <100ms retrieval after initial load (SC-001)
**Constraints**: Startup-time validation, service restart required for template updates
**Scale/Scope**: Expected 10-50 prompt templates, 5-10 config templates, 5-10 rubrics in MVP

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec files exist in /specs/005-prompt-config-registry/ |
| II. Type Safety & Schema Validation | PASS | TypeScript strict mode, Ajv for vars_schema validation, class-validator DTOs for API |
| III. Multi-Tenant First | N/A | Registry content is explicitly global (clarified in spec) - templates are platform resources |
| IV. Monorepo Discipline | PASS | Follows dto→common→dao→agent-platform hierarchy; new module in agent-platform |
| V. Error Handling & Observability | PASS | Result objects for failures, structured logging, debug info in run_steps |

## Project Structure

### Documentation (this feature)

```text
specs/005-prompt-config-registry/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
# DTO package (shared types)
dto/src/
└── prompt-registry/
    ├── index.ts
    ├── prompt-template.interface.ts
    ├── config-template.interface.ts
    ├── review-rubric.interface.ts
    └── resolved-prompt-record.interface.ts

# Agent platform (service implementation + template storage)
agent-platform/
├── prompts/                    # Template storage (colocated with service)
│   ├── campaign_plan/
│   │   └── 1.0.0.md
│   ├── game_config/
│   │   └── 1.0.0.md
│   └── review_asset/
│       └── 1.0.0.md
├── configs/                    # Config template storage
│   └── game_settings/
│       └── 1.0.0.json
├── rubrics/                    # Rubric storage
│   └── asset_quality/
│       └── 1.0.0.json
└── src/
    └── prompt-registry/
        ├── prompt-registry.module.ts
        ├── services/
        │   ├── prompt-registry.service.ts
        │   ├── template-loader.service.ts
        │   └── template-renderer.service.ts
        └── interfaces/
            └── registry-types.ts
```

**Structure Decision**: New `prompt-registry` module in `agent-platform` following existing module patterns. DTOs in `dto` package for type sharing. Template files colocated within `agent-platform/` (`prompts/`, `configs/`, `rubrics/`) since agent-platform is the only service that uses them. This keeps related code and data together and simplifies deployment.

## Complexity Tracking

> No constitution violations - no entries needed.
