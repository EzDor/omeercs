# Implementation Plan: Campaign UI

**Branch**: `012-campaign-ui` | **Date**: 2026-02-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-campaign-ui/spec.md`
**Scope**: Backend + AI platform focus. Minimal UI for testing only.

## Summary

Build the backend infrastructure for campaign lifecycle management: a Campaign entity with full CRUD, status machine (draft → generating → live → failed → archived), optimistic concurrency control, soft-delete with 30-day run retention, public player endpoints with IP rate limiting, and campaign-scoped run queries. The agent-platform receives a campaign status service that updates campaigns when runs complete. A minimal Vue page provides basic CRUD and generation trigger for manual testing.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 20+
**Primary Dependencies**: NestJS 10, TypeORM, BullMQ, class-validator, @nestjs/throttler
**Storage**: PostgreSQL 17 (pgvector), schema `app`; local filesystem (`ASSET_STORAGE_DIR`) for bundles
**Testing**: Jest (agent-platform, api-center), Vitest (webapp)
**Target Platform**: Linux server (backend), Web browser (minimal frontend)
**Project Type**: Web application (monorepo with 6 workspaces)
**Performance Goals**: Campaign list < 2s for 100 campaigns; public player endpoint < 500ms
**Constraints**: Multi-tenant isolation on all queries; optimistic concurrency on campaign updates
**Scale/Scope**: ~100 campaigns per tenant, 5 concurrent users per tenant

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*Reference: .specify/memory/constitution.md v1.0.0*

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Spec-Driven Development | PASS | Spec at specs/012-campaign-ui/spec.md, clarifications complete, plan in progress |
| II. Type Safety & Schema Validation | PASS | Campaign DTOs use class-validator; CampaignConfig validated by template JSON Schema; TypeScript strict mode |
| III. Multi-Tenant First | PASS | Campaign entity extends BaseEntity with tenantId; all queries filtered by tenant; public player endpoints validate campaign is live (no tenant leak) |
| IV. Monorepo Discipline | PASS | DTOs in dto/, entity in dao/, API in api-center/, status service in agent-platform/, minimal UI in webapp/. Follows dto→common→dao→services hierarchy |
| V. Error Handling & Observability | PASS | 409 Conflict for version mismatch; 422 for invalid state transitions; structured logging on all service operations; NotFoundException for tenant-isolated 404s |

## Constitution Check (Post-Design)

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Spec-Driven Development | PASS | All design artifacts generated: research.md, data-model.md, contracts/, quickstart.md |
| II. Type Safety & Schema Validation | PASS | Campaign DTOs defined with class-validator decorators; CampaignConfig JSONB validated against template schema before generation |
| III. Multi-Tenant First | PASS | Campaign entity has tenantId (indexed), composite indexes on (tenantId, status) and (tenantId, userId); public endpoints return only live campaigns with no tenant info |
| IV. Monorepo Discipline | PASS | No cross-service imports; campaign DTOs shared via dto package; CampaignStatusService in agent-platform uses repository directly (same DB) |
| V. Error Handling & Observability | PASS | Version conflict → 409; invalid transitions → 422; not found → 404; bulk ops return per-item errors; Logger on all service methods |

## Project Structure

### Documentation (this feature)

```text
specs/012-campaign-ui/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: Campaign entity model
├── quickstart.md        # Phase 1: dev setup guide
├── contracts/
│   ├── campaign-api.md      # Campaign CRUD + lifecycle endpoints
│   ├── public-player-api.md # Public player endpoints
│   └── run-monitoring-api.md # Campaign-scoped run queries
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
dto/src/
└── campaign/
    ├── campaign.dto.ts              # CreateCampaignRequest, UpdateCampaignRequest, CampaignResponse
    ├── campaign-list-query.dto.ts   # CampaignListQuery (filters, sort, pagination)
    └── campaign-config.interface.ts # CampaignConfig, ThemeConfig types

dao/src/
├── entities/
│   └── campaign.entity.ts          # Campaign entity extending BaseEntity
└── migrations/
    └── {timestamp}-CreateCampaignTable.ts

api-center/src/
└── campaign/
    ├── campaign.module.ts           # NestJS module (TypeORM, BullMQ, Throttler)
    ├── campaign.controller.ts       # Authenticated CRUD + lifecycle endpoints
    ├── campaign-api.service.ts      # Business logic, validation, state machine
    └── public-player.controller.ts  # @Public() player endpoints with rate limiting

agent-platform/src/
└── campaign/
    ├── campaign.module.ts           # NestJS module (TypeORM)
    └── campaign-status.service.ts   # Updates campaign status when runs complete/fail

webapp/src/
├── pages/
│   └── CampaignsPage.vue           # Minimal campaign list + create + actions
├── stores/
│   └── campaign.store.ts           # Pinia store for campaign state
└── services/
    └── campaign.service.ts          # API client for campaign endpoints
```

**Structure Decision**: Follows the existing monorepo pattern. New `campaign/` module directories in api-center and agent-platform mirror the existing `run-engine/` and `chat/` patterns. DTOs in a new `dto/src/campaign/` directory. Single Campaign entity in dao. Minimal frontend in webapp with one page, one store, one service.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
