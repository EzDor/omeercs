# Implementation Plan: Campaign Context Model

**Branch**: `008-campaign-context` | **Date**: 2026-02-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-campaign-context/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement a CampaignContext runtime contract that enables multi-step workflow orchestration by maintaining artifact references, step results, and computed data throughout workflow execution. The context supports: attaching step artifacts with automatic reference updates, resolving artifacts by logical name, loading context from previous runs for update workflows, and persisting after each step for crash recovery.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20.x (matches existing codebase)
**Primary Dependencies**: NestJS 11.x, TypeORM, class-validator, class-transformer
**Storage**: PostgreSQL with TypeORM (CampaignContext as JSONB in Run entity or separate table)
**Testing**: Jest (existing test framework in agent-platform and dao packages)
**Target Platform**: Linux server (Docker containers)
**Project Type**: Monorepo (dto → common → dao → agent-platform)
**Performance Goals**: Context operations <10ms; support up to 50 artifacts per context (FR-012)
**Constraints**: Context must be JSON-serializable for PostgreSQL checkpointer; persist after each step (FR-011)
**Scale/Scope**: Standard campaign complexity (~12 standard reference types, extensible via registry)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec exists at `/specs/008-campaign-context/spec.md` with 4 user stories, 13 FRs |
| II. Type Safety & Schema Validation | PASS | TypeScript interfaces for CampaignContext; class-validator for DTOs; JSON Schema for reference type registry |
| III. Multi-Tenant First | PASS | CampaignContext tied to Run entity which has tenantId; context operations respect tenant isolation |
| IV. Monorepo Discipline | PASS | Interfaces in dto; context service in common or agent-platform; entities in dao |
| V. Error Handling & Observability | PASS | Result objects for resolver failures; structured logging for context operations |

## Project Structure

### Documentation (this feature)

```text
specs/008-campaign-context/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: Research decisions
├── data-model.md        # Phase 1: Entity and interface design
├── quickstart.md        # Phase 1: Usage guide
├── contracts/           # Phase 1: Service contracts
│   ├── campaign-context.service.contract.ts
│   └── artifact-types.schema.json
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
dto/
└── src/
    └── campaign-context/
        ├── campaign-context.interface.ts      # CampaignContext, ArtifactData, etc.
        ├── trigger-info.interface.ts          # TriggerInfo, TriggerType
        ├── computed-data.interface.ts         # ComputedData, QualityCheckResult
        ├── artifact-references.interface.ts   # ArtifactReferences type
        ├── context-error.interface.ts         # Error codes and types
        └── standard-artifact-types.enum.ts    # StandardArtifactType enum

common/
└── src/
    └── campaign-context/
        ├── campaign-context.service.ts        # Create, attach, persist operations
        ├── context-resolver.service.ts        # getRef, getArtifact, listRefs
        ├── reference-type-registry.service.ts # Type validation, config loading
        └── campaign-context.module.ts         # NestJS module

dao/
└── src/
    ├── entities/
    │   └── run.entity.ts                      # Add context: JSONB column
    └── migrations/
        └── {timestamp}-AddContextColumnToRuns.ts

agent-platform/
└── src/
    └── workflow-orchestration/
        └── (integration with existing orchestrator)
```

**Structure Decision**: Monorepo pattern following dto → common → dao dependency order.
- Interfaces in `dto` for sharing across packages
- Services in `common` for use by both `api-center` and `agent-platform`
- Entity modification in `dao` with migration
- No new packages created; extends existing structure

## Constitution Check (Post-Design)

*Re-evaluation after Phase 1 design completion.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Complete spec with 4 user stories, 13 FRs; plan with research, data-model, contracts |
| II. Type Safety & Schema Validation | PASS | TypeScript interfaces in dto; JSON Schema for artifact-types config; class-validator can be added to DTOs if API exposure needed |
| III. Multi-Tenant First | PASS | Context stored in Run entity (has tenantId); loadFromRun validates tenant ownership |
| IV. Monorepo Discipline | PASS | dto (interfaces) → common (services) → dao (entity) hierarchy respected |
| V. Error Handling & Observability | PASS | Result objects with typed error codes; structured errors for all failure cases |

## Complexity Tracking

> No violations identified. All design decisions follow constitution principles.
