# Implementation Plan: Agent Layer Decision Rules

**Branch**: `006-agent-layer-rules` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-agent-layer-rules/spec.md`

## Summary

Implement skill template types (`LLM_JSON_GENERATION` and `LLM_REVIEW`) within the existing SkillRunner framework to standardize bounded LLM operations with schema validation. This feature extends the current skill catalog with reusable patterns for generating validated JSON output and performing rubric-based asset reviews. Additionally, implement a generate-review-retry pattern as an MVP substitute for LangGraph-style loops, along with comprehensive documentation (Agent Usage Policy).

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20.x (matches existing codebase)
**Primary Dependencies**: NestJS 11.x, class-validator, class-transformer, js-yaml, Ajv (existing SchemaValidatorService), Mustache (existing PromptRegistryService), LiteLLMHttpClient (existing)
**Storage**: PostgreSQL with TypeORM (existing Run/RunStep tables for debug storage); Filesystem for prompt templates (existing pattern)
**Testing**: Deferred (tests not required for this phase)
**Target Platform**: Linux server (Docker containers)
**Project Type**: Monorepo (agent-platform service)
**Performance Goals**: Skill execution within existing timeout constraints (default 60s); LLM retry within 3 attempts
**Constraints**: Schema validation must complete <100ms; Exponential backoff max delay 8s (2^3 * 1000ms)
**Scale/Scope**: Extension of existing 15+ skills; 2 new template types; 2 concrete example skills

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec files exist in /specs/006-agent-layer-rules/ |
| II. Type Safety & Schema Validation | PASS | TypeScript strict, existing Ajv for JSON Schema, class-validator for DTOs |
| III. Multi-Tenant First | N/A | No new entities with tenant scope; extends existing skill infrastructure |
| IV. Monorepo Discipline | PASS | Changes contained to agent-platform; uses existing common/dto packages |
| V. Error Handling & Observability | PASS | SkillResult pattern for failures, structured logging via existing Logger |

## Project Structure

### Documentation (this feature)

```text
specs/006-agent-layer-rules/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
agent-platform/src/
├── skills/
│   ├── skill-runner/
│   │   ├── skill-runner.service.ts          # Extend with template type handling
│   │   ├── services/
│   │   │   ├── schema-validator.service.ts  # Existing (no changes needed)
│   │   │   ├── llm-generation.service.ts    # NEW: LLM_JSON_GENERATION logic
│   │   │   └── llm-review.service.ts        # NEW: LLM_REVIEW logic
│   │   └── templates/                       # NEW: Skill template type definitions
│   │       ├── llm-json-generation.template.ts
│   │       └── llm-review.template.ts
│   ├── handlers/
│   │   ├── campaign-plan-from-brief.handler.ts     # Refactor to use template
│   │   ├── review-asset-quality.handler.ts         # Refactor to use template
│   │   ├── game-config-from-template.handler.ts    # Example: LLM_JSON_GENERATION
│   │   └── [existing handlers...]
│   └── catalog/
│       └── [skill descriptors - update template_type field]
├── prompt-registry/
│   ├── prompts/
│   │   └── [existing prompts]
│   └── rubrics/
│       └── [existing rubrics - used by LLM_REVIEW]
└── docs/
    └── agent-usage-policy.md               # NEW: Decision rules documentation
```

**Structure Decision**: Extends existing agent-platform skill infrastructure. New services (`llm-generation.service.ts`, `llm-review.service.ts`) encapsulate template-specific logic while preserving the existing SkillRunnerService orchestration pattern. Documentation placed in `agent-platform/docs/` for discoverability.

## Complexity Tracking

> No Constitution Check violations requiring justification.
