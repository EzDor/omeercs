# Implementation Plan: Run Engine (Workflow Orchestrator + Partial Rebuild)

**Branch**: `004-run-engine` | **Date**: 2026-01-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-run-engine/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement a Workflow Orchestrator that executes DAG-based workflows end-to-end, with step caching based on input hashing and partial rebuild capability. The engine integrates with the existing SkillRunner service to execute individual steps, uses BullMQ for job orchestration, and persists run/step state to PostgreSQL with multi-tenant isolation.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20.x (matches existing codebase)
**Primary Dependencies**: NestJS 11.x, BullMQ, TypeORM, class-validator, class-transformer, existing SkillRunner service
**Storage**: PostgreSQL with TypeORM (new tables: runs, run_steps, step_cache); Valkey/Redis for step cache (TTL-based)
**Testing**: Jest for unit tests, integration tests with test database
**Target Platform**: Linux server (Docker container)
**Project Type**: Monorepo services (agent-platform primary, api-center for API exposure, dao for entities)
**Performance Goals**: Execute 13-step workflow within skill execution time bounds; cached steps return < 1 second
**Constraints**: Parallel step execution for independent steps; idempotent step execution; crash-safe resumption
**Scale/Scope**: ~13 steps per workflow; multiple concurrent runs per tenant; step-level caching across runs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check (Phase 0)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec exists at /specs/004-run-engine/spec.md with 33 FRs, 5 user stories |
| II. Type Safety & Schema Validation | PASS | Will use TypeScript strict, class-validator DTOs for all API inputs, JSON Schema for WorkflowSpec/StepSpec |
| III. Multi-Tenant First | PASS | Run and RunStep entities will extend BaseEntity with tenantId; all queries filtered by tenant |
| IV. Monorepo Discipline | PASS | Follows dto→common→dao→api-center/agent-platform hierarchy; no cross-imports between services |
| V. Error Handling & Observability | PASS | Result objects for step failures; structured logging for run/step lifecycle events per FR-031-033 |

### Post-Design Verification (Phase 1)

| Principle | Status | Verification |
|-----------|--------|--------------|
| I. Spec-Driven Development | PASS | Generated: research.md, data-model.md, contracts/run-engine-api.yaml, quickstart.md |
| II. Type Safety & Schema Validation | PASS | data-model.md defines TypeScript interfaces; OpenAPI schema defines all DTOs with validation |
| III. Multi-Tenant First | PASS | Run, RunStep, StepCache entities include tenantId with indexes; all SQL queries filter by tenant |
| IV. Monorepo Discipline | PASS | Structure follows dto→common→dao→services; no circular dependencies in design |
| V. Error Handling & Observability | PASS | RunError/StepError schemas defined; logging events documented in quickstart.md |

## Project Structure

### Documentation (this feature)

```text
specs/004-run-engine/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Monorepo structure for Run Engine feature

dto/src/
├── run-engine/
│   ├── run.dto.ts                 # Run request/response DTOs
│   ├── run-step.dto.ts            # RunStep DTOs
│   ├── change-request.dto.ts      # ChangeRequest DTOs
│   └── workflow.dto.ts            # WorkflowSpec/StepSpec types

dao/src/
├── entities/
│   ├── run.entity.ts              # Run entity (extends BaseEntity)
│   ├── run-step.entity.ts         # RunStep entity (extends BaseEntity)
│   └── step-cache.entity.ts       # StepCache entity (extends BaseEntity)
├── migrations/
│   └── {timestamp}-CreateRunEngineSchema.ts

common/src/
├── queues/
│   └── queue-names.ts             # Add RUN_EXECUTION queue name

agent-platform/src/
├── run-engine/
│   ├── run-engine.module.ts
│   ├── services/
│   │   ├── run-engine.service.ts           # Main orchestration service
│   │   ├── workflow-registry.service.ts    # Workflow definition registry
│   │   ├── dependency-graph.service.ts     # DAG operations (toposort, downstream)
│   │   ├── step-cache.service.ts           # Cache lookup/storage
│   │   ├── input-hasher.service.ts         # Canonical JSON + SHA256
│   │   └── change-request-mapper.service.ts # ChangeRequest → impacted steps
│   ├── processors/
│   │   └── run-orchestrator.processor.ts   # BullMQ job processor
│   └── interfaces/
│       ├── workflow-spec.interface.ts
│       ├── step-spec.interface.ts
│       └── run-context.interface.ts

api-center/src/
├── run-engine/
│   ├── run-engine.module.ts
│   ├── run-engine.controller.ts            # REST API endpoints
│   └── services/
│       └── run-engine-api.service.ts       # Queue producer
```

**Structure Decision**: Follows existing monorepo pattern with dto→common→dao→services hierarchy. Run Engine logic lives primarily in `agent-platform/src/run-engine/` for execution, with API exposure in `api-center/src/run-engine/`. Entities in `dao/src/entities/`, DTOs in `dto/src/run-engine/`.

## Complexity Tracking

> No violations identified - all complexity is justified by specification requirements.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | - | - |
