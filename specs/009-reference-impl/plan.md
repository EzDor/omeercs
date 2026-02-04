# Implementation Plan: Reference Implementations

**Branch**: `009-reference-impl` | **Date**: 2026-02-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-reference-impl/spec.md`

## Summary

Validate the end-to-end agentic platform by implementing 3 reference skills (deterministic manifest assembly, stub audio provider, Claude JSON generation) and a runnable `campaign.build.v1` workflow. The implementation leverages existing platform infrastructure (Specs 1-8) to demonstrate the complete data flow: Registry → Runner → Providers → Artifacts → Run Engine → Workflow Registry.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20.x (matches existing codebase)
**Primary Dependencies**: NestJS 11.x, class-validator, class-transformer, js-yaml, Ajv (JSON Schema validation), LiteLLMHttpClient (existing)
**Storage**: PostgreSQL with TypeORM (Run, RunStep, Artifact, StepCache entities); filesystem for workflow YAML and skill catalogs
**Testing**: Jest with `@nestjs/testing`; integration tests with test database
**Target Platform**: Linux server (docker-compose environment)
**Project Type**: Monorepo with existing package structure
**Performance Goals**: Full workflow under 30 seconds for stub providers; individual skill execution under 5 seconds for deterministic skills
**Constraints**: LLM calls subject to provider latency; audio generation may require async polling
**Scale/Scope**: Single workflow with 4 core steps (minimal DAG); 3 skills + 1 stub bundler

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | Spec files exist in /specs/009-reference-impl/; follows specify workflow |
| II. Type Safety & Schema Validation | PASS | DTOs with class-validator in dto/src/skills/; JSON Schema validation via Ajv in SchemaValidatorService |
| III. Multi-Tenant First | PASS | Run, RunStep, Artifact entities include tenantId; CampaignContext propagates tenant context |
| IV. Monorepo Discipline | PASS | Follows dto→common→dao→services hierarchy; skills in agent-platform, DTOs in dto package |
| V. Error Handling & Observability | PASS | SkillResult pattern with ok/error; timing instrumentation in handlers; LangSmith tracing available |

## Project Structure

### Documentation (this feature)

```text
specs/009-reference-impl/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (existing + new)

```text
# Existing structure being leveraged/extended

agent-platform/
├── src/
│   ├── skills/
│   │   ├── handlers/
│   │   │   ├── assemble-campaign-manifest.handler.ts  # ✅ EXISTS
│   │   │   ├── generate-bgm-track.handler.ts          # ✅ EXISTS (needs stub mode)
│   │   │   ├── game-config-from-template.handler.ts   # ✅ EXISTS (needs retry logic)
│   │   │   └── bundle-game-template.handler.ts        # ✅ EXISTS
│   │   ├── services/
│   │   │   └── skill-catalog.service.ts               # ✅ EXISTS
│   │   └── skill-runner/
│   │       └── skill-runner.service.ts                # ✅ EXISTS
│   ├── run-engine/
│   │   ├── services/
│   │   │   ├── run-engine.service.ts                  # ✅ EXISTS
│   │   │   ├── workflow-registry.service.ts           # ✅ EXISTS
│   │   │   ├── step-cache.service.ts                  # ✅ EXISTS
│   │   │   └── workflow-yaml-loader.service.ts        # ✅ EXISTS
│   │   └── interfaces/                                # ✅ EXISTS
│   └── prompt-registry/
│       └── services/
│           └── prompt-registry.service.ts             # ✅ EXISTS
├── workflows/
│   ├── index.yaml                                     # ✅ EXISTS
│   ├── campaign.build.v1.yaml                         # ✅ EXISTS (needs minimal DAG variant)
│   └── campaign.update_audio.v1.yaml                  # ✅ EXISTS

skills/
├── catalog/
│   ├── index.yaml                                     # ✅ EXISTS
│   ├── assemble_campaign_manifest.yaml                # ✅ EXISTS
│   ├── generate_bgm_track.yaml                        # ✅ EXISTS
│   ├── game_config_from_template.yaml                 # ✅ EXISTS
│   └── bundle_game_template.yaml                      # ✅ EXISTS

common/
├── src/
│   ├── campaign-context/
│   │   └── campaign-context.service.ts                # ✅ EXISTS
│   └── providers/
│       ├── adapters/
│       │   └── stability.adapter.ts                   # ✅ EXISTS (image only)
│       └── registries/
│           └── image-provider.registry.ts             # ✅ EXISTS

dto/
├── src/
│   ├── skills/
│   │   ├── assemble-campaign-manifest.dto.ts          # ✅ EXISTS
│   │   ├── generate-bgm-track.dto.ts                  # ✅ EXISTS
│   │   ├── game-config.dto.ts                         # ✅ EXISTS
│   │   └── bundle-game-template.dto.ts                # ✅ EXISTS
│   └── providers/
│       └── interfaces/
│           └── audio-provider.interface.ts            # ✅ EXISTS (needs stub impl)

dao/
├── src/
│   └── entities/
│       ├── run.entity.ts                              # ✅ EXISTS
│       ├── run-step.entity.ts                         # ✅ EXISTS
│       ├── artifact.entity.ts                         # ✅ EXISTS
│       └── step-cache.entity.ts                       # ✅ EXISTS
```

**Structure Decision**: Leveraging existing monorepo structure. Reference implementation validates existing code paths with minimal new development. Focus is on integration, testing, and stub provider implementation.

## Complexity Tracking

> No constitution violations requiring justification.

## Implementation Analysis

### Existing Assets Summary

| Component | Status | Gap |
|-----------|--------|-----|
| assemble_campaign_manifest handler | ✅ Complete | None - deterministic skill fully implemented |
| generate_bgm_track handler | ✅ Complete | Uses LiteLLM; needs stub provider mode for testing |
| game_config_from_template handler | ✅ Complete | Needs explicit retry logic for JSON validation |
| bundle_game_template handler | ✅ Complete | Creates placeholder when template missing |
| campaign.build.v1 workflow | ✅ Complete | Full DAG with 14 steps; need minimal 4-step variant |
| campaign.update_audio.v1 workflow | ✅ Complete | Tests partial rebuild |
| Run/RunStep entities | ✅ Complete | Input hash, cache hit tracking |
| CampaignContext | ✅ Complete | Context creation, artifact attachment |
| Audio provider interface | ✅ Interface only | Need StubAudioProvider adapter |

### Gaps to Address

1. **Stub Audio Provider**: Implement `StubAudioProvider` adapter that returns placeholder audio files without real API calls
2. **Minimal Workflow Variant**: Create `campaign.build.v1.minimal` with only 4 steps (game_config, bgm, bundle, manifest)
3. **Retry Logic for Claude JSON**: Already implemented in `LlmGenerationService` - ensure YAML config enables it
4. **Integration Tests**: End-to-end test for full workflow + partial rebuild scenarios
5. **Diagnostic Data Capture**: Ensure input_hash, output_snapshot, duration, errors captured per FR-011

---

## Post-Design Constitution Check

*Re-check after Phase 1 design is complete.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Spec-Driven Development | PASS | All design artifacts created: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md |
| II. Type Safety & Schema Validation | PASS | Contracts define OpenAPI schemas; skill DTOs use class-validator; JSON Schema validation in place |
| III. Multi-Tenant First | PASS | Design leverages existing tenant-scoped entities; no new tenant bypass introduced |
| IV. Monorepo Discipline | PASS | New code follows existing package structure; stub provider in common/src/providers/adapters |
| V. Error Handling & Observability | PASS | SkillResult diagnostics documented; RunStep captures input_hash, duration, errors |

---

## Generated Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| Research | `specs/009-reference-impl/research.md` | Technical decisions for all unknowns |
| Data Model | `specs/009-reference-impl/data-model.md` | Entity documentation and relationships |
| Contracts | `specs/009-reference-impl/contracts/` | OpenAPI specifications for APIs |
| Quickstart | `specs/009-reference-impl/quickstart.md` | Developer setup and testing guide |

---

## Ready for Task Generation

This plan is complete. Run `/speckit.tasks` to generate actionable implementation tasks.
