# Implementation Plan: Default Workflow Pack

**Branch**: `007-default-workflow-pack` | **Date**: 2026-02-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-default-workflow-pack/spec.md`

## Summary

Ship 7 YAML-based workflow definitions (1 full build + 6 update workflows) that connect the existing 17 game-building skills into declarative DAGs. Implement a Workflow YAML Loader and Input Selector Interpreter to load these definitions at startup and expose them to the existing Run Engine for execution.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20.x (matches existing codebase)
**Primary Dependencies**: NestJS 11.x, js-yaml, Ajv (existing SchemaValidatorService), semver (existing pattern)
**Storage**: Filesystem for workflow YAML files; PostgreSQL for run data (existing Run, RunStep, StepCache, Artifact tables)
**Testing**: N/A (excluded from this feature scope)
**Target Platform**: Linux server (Docker containers)
**Project Type**: Monorepo (dto → common → dao → agent-platform)
**Performance Goals**: Workflow loading <500ms at startup; step input resolution <10ms per step
**Constraints**: Zero-downtime workflow registration; fail-fast on invalid YAML or unresolved skill references
**Scale/Scope**: 7 workflow definitions v1; ~20 steps in largest workflow (campaign.build.v1)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

<!--
  Reference: .specify/memory/constitution.md v1.0.0
  Verify each principle below. Mark PASS, FAIL (with justification), or N/A.
-->

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec files exist in `/specs/007-default-workflow-pack/` |
| II. Type Safety & Schema Validation | PASS | Workflow YAML validated via Ajv JSON Schema; StepSpec TypeScript interfaces exist |
| III. Multi-Tenant First | N/A | Workflows are system-level definitions (like skills), not tenant-scoped; runs are tenant-scoped via existing Run entity |
| IV. Monorepo Discipline | PASS | Changes in agent-platform only; uses existing dto interfaces (WorkflowSpec, StepSpec) |
| V. Error Handling & Observability | PASS | Fail-fast validation at startup; structured logging via NestJS Logger; existing run/step observability |

## Project Structure

### Documentation (this feature)

```text
specs/007-default-workflow-pack/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (workflow YAML schemas)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
agent-platform/
├── src/
│   └── run-engine/
│       ├── services/
│       │   ├── workflow-registry.service.ts       # ENHANCE: Add YAML loading
│       │   ├── workflow-yaml-loader.service.ts    # NEW: Parse YAML files
│       │   └── input-selector-interpreter.service.ts  # NEW: Compile selectors
│       ├── schemas/
│       │   └── workflow-yaml.schema.json          # NEW: Ajv validation schema
│       └── interfaces/
│           ├── workflow-spec.interface.ts         # EXISTING
│           ├── workflow-yaml.interface.ts         # NEW: Raw YAML structure
│           └── input-selector.interface.ts        # NEW: Selector types
└── workflows/
    ├── index.yaml                                 # NEW: Workflow index
    ├── campaign.build.v1.yaml                     # NEW: Full build workflow
    ├── campaign.update_audio.v1.yaml              # NEW: Audio update
    ├── campaign.update_intro.v1.yaml              # NEW: Intro update
    ├── campaign.update_outcome.v1.yaml            # NEW: Outcome update
    ├── campaign.update_game_config.v1.yaml        # NEW: Game config update
    └── campaign.replace_3d_asset.v1.yaml          # NEW: 3D asset replacement
```

**Structure Decision**: Extends existing `agent-platform/src/run-engine/` module with new services following the established pattern (SkillCatalogService). Workflow YAML files live in `agent-platform/workflows/` similar to how skills live in `skills/catalog/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations - all constitution checks passed.*
