# Implementation Plan: Skill Runner

**Branch**: `001-skill-runner` | **Date**: 2026-01-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-skill-runner/spec.md`

## Summary

Implement a SkillRunner system that executes registered skills from the skill catalog, validates inputs/outputs against JSON schemas, registers artifacts with metadata, and returns standardized SkillResult objects. The implementation enhances the existing SkillCatalogService with a dedicated SkillRunnerService that manages execution context, validation lifecycle, and artifact registration.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20.x (matches existing codebase)
**Primary Dependencies**: NestJS 11.x, class-validator, class-transformer, js-yaml, Ajv (JSON Schema validation)
**Storage**: PostgreSQL with TypeORM (for artifact registry metadata)
**Testing**: Jest with NestJS testing utilities
**Target Platform**: Linux server (Docker containerized, same as existing services)
**Project Type**: Monorepo workspace extension (agent-platform)
**Performance Goals**: <5s execution for simple skills (excluding external provider calls per SC-001)
**Constraints**: Workspace isolation per execution, 60-second default timeout (configurable per-skill)
**Scale/Scope**: 15+ existing skills, concurrent execution support, artifact metadata persistence

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: The project constitution (`/.specify/memory/constitution.md`) is a template that hasn't been customized for this project yet. The following gates are inferred from the codebase patterns and CLAUDE.md:

| Gate | Status | Notes |
|------|--------|-------|
| Existing patterns followed | PASS | Follows SkillsModule/SkillCatalogService patterns |
| Monorepo structure respected | PASS | Extends agent-platform workspace only |
| Build order maintained | PASS | No new shared packages required |
| Multi-tenancy respected | PASS | Uses TenantClsService for context propagation |
| Error handling standardized | PASS | Returns SkillResult envelope, not throws |
| Validation patterns | PASS | JSON Schema (Ajv) for skill schemas, class-validator for DTOs |

## Project Structure

### Documentation (this feature)

```text
specs/001-skill-runner/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── skill-runner.openapi.yaml
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
agent-platform/
├── src/
│   ├── skills/
│   │   ├── skill-runner/                    # NEW: SkillRunner module
│   │   │   ├── skill-runner.module.ts       # Module definition
│   │   │   ├── skill-runner.service.ts      # Main execution service
│   │   │   ├── services/
│   │   │   │   ├── schema-validator.service.ts    # JSON Schema validation
│   │   │   │   ├── execution-context.service.ts   # Context factory
│   │   │   │   └── workspace.service.ts           # Workspace management
│   │   │   ├── interfaces/
│   │   │   │   ├── skill-result.interface.ts      # Exists - extend if needed
│   │   │   │   └── execution-context.interface.ts # Enhanced context
│   │   │   └── exceptions/
│   │   │       ├── skill-input-validation.exception.ts
│   │   │       ├── skill-output-validation.exception.ts
│   │   │       ├── skill-execution.exception.ts
│   │   │       └── skill-policy-violation.exception.ts
│   │   ├── artifact-registry/               # NEW: ArtifactRegistry module
│   │   │   ├── artifact-registry.module.ts
│   │   │   ├── artifact-registry.service.ts
│   │   │   └── interfaces/
│   │   │       └── artifact.interface.ts
│   │   ├── services/
│   │   │   └── skill-catalog.service.ts     # Existing - minimal changes
│   │   ├── handlers/                        # Existing skill handlers
│   │   ├── interfaces/
│   │   │   └── skill-handler.interface.ts   # Existing
│   │   └── skills.module.ts                 # Update imports
│   └── app.module.ts                        # Update imports
├── test/
│   ├── skill-runner/
│   │   ├── skill-runner.service.spec.ts
│   │   ├── schema-validator.service.spec.ts
│   │   └── integration/
│   │       └── skill-execution.integration.spec.ts
│   └── artifact-registry/
│       └── artifact-registry.service.spec.ts

dao/
├── src/
│   ├── entities/
│   │   └── artifact.entity.ts               # NEW: Artifact metadata entity
│   └── migrations/
│       └── YYYYMMDDHHMMSS-CreateArtifactTable.ts

dto/
├── src/
│   └── skills/
│       ├── skill-result.dto.ts              # Extend with artifact refs
│       └── artifact.dto.ts                  # NEW: Artifact DTOs
```

**Structure Decision**: Extends existing monorepo structure. SkillRunnerModule and ArtifactRegistryModule added as sub-modules within agent-platform/src/skills/. Artifact entity added to dao package for persistence. Shared DTOs added to dto package.

## Complexity Tracking

> No violations identified - implementation follows existing patterns.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Module count | 2 new modules (SkillRunner, ArtifactRegistry) | Clear separation of concerns, follows existing pattern |
| New dependencies | Ajv (JSON Schema validation) | Required for FR-002/FR-003; class-validator is for DTOs, not JSON Schema |
| Database changes | 1 new entity (Artifact) | Required for FR-007 artifact persistence |
