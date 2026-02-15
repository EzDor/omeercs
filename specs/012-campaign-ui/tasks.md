# Tasks: Campaign UI (Backend Focus)

**Input**: Design documents from `/specs/012-campaign-ui/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md
**Scope**: Backend (api-center + agent-platform) + minimal UI test harness. Full frontend deferred per user direction.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Includes exact file paths in descriptions

---

## Phase 1: Setup (Shared Types & Entity)

**Purpose**: Create Campaign DTOs, interfaces, and entity — the shared foundation all services build on.

- [x] T001 [P] Create CampaignConfig and ThemeConfig interfaces in dto/src/campaign/campaign-config.interface.ts — define `ThemeConfig` with fields: primaryColor (string), secondaryColor (string), accentColor (string), fontFamily (string), background ({ type: 'solid' | 'gradient' | 'image', value: string }), logoUrl? (string optional); define `CampaignConfig` with fields: theme (ThemeConfig), game (Record<string, unknown>), assets ({ slotId: string, artifactId?: string, url?: string }[]). Export both interfaces.

- [x] T002 [P] Create CampaignListQuery DTO with class-validator decorators in dto/src/campaign/campaign-list-query.dto.ts — fields: status? (@IsOptional @IsEnum of 'draft'|'generating'|'live'|'failed'|'archived'), templateId? (@IsOptional @IsString), search? (@IsOptional @IsString), sortBy? (@IsOptional @IsEnum of 'name'|'createdAt'|'updatedAt', default 'updatedAt'), sortOrder? (@IsOptional @IsEnum of 'asc'|'desc', default 'desc'), limit? (@IsOptional @Type(() => Number) @IsInt @Min(1) @Max(100), default 20), offset? (@IsOptional @Type(() => Number) @IsInt @Min(0), default 0). Follow existing DTO pattern from dto/src/run-engine/run.dto.ts.

- [x] T003 Create Campaign request/response DTOs in dto/src/campaign/campaign.dto.ts — define: `CreateCampaignRequest` (name: @IsString @MaxLength(255), templateId: @IsString, config?: @IsOptional @ValidateNested CampaignConfig); `UpdateCampaignRequest` (name?: @IsOptional @IsString @MaxLength(255), config?: @IsOptional, expectedVersion?: @IsOptional @IsInt); `CampaignResponse` (id, tenantId, userId, name, templateId, status, config: CampaignConfig | null, bundleUrl: string | null, thumbnailUrl: string | null, latestRunId: string | null, version, createdAt, updatedAt); `GenerateResponse` (campaignId, runId, status: 'generating'); `BulkCampaignRequest` (campaignIds: @IsArray @ArrayMaxSize(50) @IsUUID(4, { each: true })); `BulkOperationResponse` (archived/deleted: number, skipped: number, errors: { id: string, reason: string }[]); `CampaignRunsQuery` (status?: @IsOptional @IsEnum, limit?: @IsOptional @IsInt default 20, offset?: @IsOptional @IsInt default 0); `PublicCampaignResponse` (campaignId, name, templateId, bundleUrl, config: { theme: ThemeConfig, game: Record<string, unknown> }). Import CampaignConfig from campaign-config.interface.ts.

- [x] T004 Create Campaign entity extending BaseEntity in dao/src/entities/campaign.entity.ts — @Entity('campaigns', { schema: 'app' }); columns: name (@Column varchar 255), templateId (@Column({ name: 'template_id' }) varchar 100), status (@Column varchar 20 default 'draft'), config (@Column({ type: 'jsonb', nullable: true })), bundleUrl (@Column({ name: 'bundle_url', nullable: true, length: 2048 })), thumbnailUrl (@Column({ name: 'thumbnail_url', nullable: true, length: 2048 })), latestRunId (@Column({ name: 'latest_run_id', type: 'uuid', nullable: true })), version (@Column({ type: 'int', default: 1 })), deletedAt (@DeleteDateColumn({ name: 'deleted_at' })). Indexes: @Index('IDX_campaigns_tenant_id', ['tenantId']), @Index('IDX_campaigns_tenant_status', ['tenantId', 'status']), @Index('IDX_campaigns_tenant_user', ['tenantId', 'userId']), @Index('IDX_campaigns_deleted_at', ['deletedAt']). BaseEntity already provides id (uuid PK), tenantId, createdAt, updatedAt. Follow pattern from dao/src/entities/run.entity.ts.

---

## Phase 2: Foundational (Build, Migration, Module Registration)

**Purpose**: Build shared packages, create and run migration, register modules in both services.

**⚠️ CRITICAL**: No feature work can begin until this phase is complete.

- [x] T005 Build shared packages in dependency order — run: `pnpm --filter @agentic-template/dto build && pnpm --filter @agentic-template/common build && pnpm --filter dao build`. Verify no TypeScript compilation errors in new campaign files.

- [x] T006 Generate TypeORM migration for Campaign table — run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:generate dao/src/migrations/CreateCampaignTable`. Review generated migration to ensure it creates the campaigns table in schema 'app' with all columns, indexes, and the status check constraint `CHK_campaigns_status: status IN ('draft', 'generating', 'live', 'failed', 'archived')`. Add the check constraint manually in the migration if TypeORM doesn't generate it from entity decorators.

- [x] T007 Run migration and verify — run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:show`. Verify all migrations show as executed. Rebuild dao after migration: `pnpm --filter dao build`.

- [x] T008 [P] Create CampaignModule in api-center/src/campaign/campaign.module.ts and register in AppModule — imports: TypeOrmModule.forFeature([Campaign, Run]) (Campaign for CRUD, Run for campaign-scoped run queries), RunEngineModule (to use RunEngineApiService.triggerRun for generate endpoint); declare providers: CampaignApiService; declare controllers: CampaignController, PublicPlayerController. Then add CampaignModule to the imports array in api-center/src/app.module.ts (follow pattern of existing RunEngineModule import).

- [x] T009 [P] Create CampaignModule in agent-platform/src/campaign/campaign.module.ts and register in AppModule — imports: TypeOrmModule.forFeature([Campaign]); providers: CampaignStatusService; exports: CampaignStatusService (needed by RunEngineModule's LangGraphRunProcessor). Then add CampaignModule to the imports array in agent-platform/src/app.module.ts (follow pattern of existing RunEngineModule import).

**Checkpoint**: Foundation ready — Campaign entity in DB, modules registered, packages built.

---

## Phase 3: US1+US2 — Campaign CRUD & Lifecycle (Priority: P1) 🎯 MVP

**Goal**: Full campaign CRUD with status machine, optimistic concurrency, soft-delete, generation trigger, and all management actions (list, filter, sort, duplicate, archive, restore, bulk operations).

**Independent Test**: Create a campaign via curl, update config with expectedVersion, trigger generate, verify status transitions, test duplicate/archive/restore/delete. Use curl commands from specs/012-campaign-ui/quickstart.md.

### Implementation

- [x] T010 [US1] Implement CampaignApiService in api-center/src/campaign/campaign-api.service.ts — inject @InjectRepository(Campaign) campaignRepo, @InjectRepository(Run) runRepo, RunEngineApiService (from RunEngineModule), Logger. Implement all methods with tenant isolation (all queries include WHERE tenantId = :tenantId AND deletedAt IS NULL):

  **create(tenantId, userId, dto: CreateCampaignRequest)**: Create Campaign with status='draft', version=1. Return saved entity.

  **findAll(tenantId, query: CampaignListQuery)**: Build QueryBuilder with: WHERE tenantId AND deletedAt IS NULL; if query.status → AND status = :status; if query.templateId → AND templateId = :templateId; if query.search → AND name ILIKE :search (wrap with %); ORDER BY query.sortBy query.sortOrder; LIMIT query.limit OFFSET query.offset. Use getManyAndCount() for total. Return { campaigns, total, limit, offset }.

  **findOne(tenantId, id)**: Find by id and tenantId. Throw NotFoundException if not found.

  **update(tenantId, id, dto: UpdateCampaignRequest)**: Find campaign. Validate status is 'draft' or 'failed' (throw 422 UnprocessableEntityException otherwise). If dto.expectedVersion provided and !== campaign.version, throw ConflictException (409). Apply partial updates (name, config). Increment version. Save and return.

  **softDelete(tenantId, id)**: Find campaign. Validate status is 'draft', 'failed', or 'archived' (throw 422 otherwise). If bundleUrl exists, delete bundle file via StorageService. Call repo.softRemove() or set deletedAt manually. Return void.

  **duplicate(tenantId, userId, id, newName?)**: Find source campaign. Create new Campaign with name = newName || `${source.name} (Copy)`, same templateId and config, status='draft', version=1. Save and return.

  **generate(tenantId, id)**: Find campaign. Validate status is 'draft' or 'failed' (throw 422 if 'generating'). Validate config is not null (throw 422 'Campaign config is incomplete'). Update status to 'generating', increment version. Call runEngineApiService.triggerRun() with workflowName from template, context: { campaignId: campaign.id }. Update campaign.latestRunId = runId. Save campaign. Return { campaignId, runId, status: 'generating' }.

  **archive(tenantId, id)**: Find campaign. Validate status === 'live' (throw 422). Set status = 'archived', increment version. Save and return.

  **restore(tenantId, id)**: Find campaign. Validate status === 'archived' (throw 422). Set status = 'live', increment version. Save and return.

  **bulkArchive(tenantId, campaignIds[])**: Iterate each id: try archive, catch errors. Return { archived: successCount, skipped: skipCount, errors: [{ id, reason }] }.

  **bulkDelete(tenantId, campaignIds[])**: Iterate each id: try softDelete, catch errors. Return { deleted: successCount, skipped: skipCount, errors: [{ id, reason }] }.

  **getCampaignRuns(tenantId, campaignId, query)**: Validate campaign exists for tenant. Query Run repository: WHERE tenantId = :tenantId AND context->>'campaignId' = :campaignId; if query.status → AND status = :status; ORDER BY createdAt DESC; LIMIT/OFFSET. Return { runs, total, limit, offset }.

- [x] T011 [US2] Implement CampaignController in api-center/src/campaign/campaign.controller.ts — @Controller('campaigns'), @UseGuards(AuthGuard). Extract tenantId and userId from request auth context (follow pattern from api-center/src/chat/chat.controller.ts using req.auth). Endpoints:

  `POST /` → @Post() @HttpCode(201) create(@Body() dto: CreateCampaignRequest, @Req() req) → campaignService.create(tenantId, userId, dto)

  `GET /` → @Get() findAll(@Query() query: CampaignListQuery, @Req() req) → campaignService.findAll(tenantId, query)

  `GET /:campaignId` → @Get(':campaignId') findOne(@Param('campaignId', ParseUUIDPipe) id, @Req() req)

  `PATCH /:campaignId` → @Patch(':campaignId') update(@Param('campaignId', ParseUUIDPipe) id, @Body() dto: UpdateCampaignRequest, @Req() req)

  `DELETE /:campaignId` → @Delete(':campaignId') @HttpCode(204) remove(@Param('campaignId', ParseUUIDPipe) id, @Req() req)

  `POST /:campaignId/duplicate` → @Post(':campaignId/duplicate') @HttpCode(201) duplicate(@Param('campaignId', ParseUUIDPipe) id, @Body() body: { name?: string }, @Req() req)

  `POST /:campaignId/generate` → @Post(':campaignId/generate') @HttpCode(202) generate(@Param('campaignId', ParseUUIDPipe) id, @Req() req)

  `POST /:campaignId/archive` → @Post(':campaignId/archive') archive(@Param('campaignId', ParseUUIDPipe) id, @Req() req)

  `POST /:campaignId/restore` → @Post(':campaignId/restore') restore(@Param('campaignId', ParseUUIDPipe) id, @Req() req)

  `POST /bulk-archive` → @Post('bulk-archive') bulkArchive(@Body() dto: BulkCampaignRequest, @Req() req)

  `POST /bulk-delete` → @Post('bulk-delete') bulkDelete(@Body() dto: BulkCampaignRequest, @Req() req)

  `GET /:campaignId/runs` → @Get(':campaignId/runs') getCampaignRuns(@Param('campaignId', ParseUUIDPipe) id, @Query() query: CampaignRunsQuery, @Req() req)

**Checkpoint**: All authenticated campaign endpoints functional. Test with curl commands from quickstart.md.

---

## Phase 4: US3 — Agent Platform Status Integration (Priority: P2)

**Goal**: Campaign status automatically updates to 'live' or 'failed' when runs complete/fail in the agent-platform processor.

**Independent Test**: Trigger campaign generation via POST /campaigns/:id/generate. Wait for run to complete/fail. Verify campaign status changed to 'live' (with bundleUrl set) or 'failed'. Check via GET /campaigns/:id.

### Implementation

- [x] T012 [US3] Implement CampaignStatusService in agent-platform/src/campaign/campaign-status.service.ts — inject @InjectRepository(Campaign) campaignRepo, Logger. Implement:

  **updateStatusFromRun(campaignId: string, update: { status: 'live' | 'failed', bundleUrl?: string, latestRunId: string })**: If campaignId is null/undefined, return silently (runs without campaigns). Find campaign by id (no tenant filter needed — internal service call, campaignId is trusted). Update campaign.status = update.status. If update.bundleUrl, set campaign.bundleUrl. Set campaign.latestRunId = update.latestRunId. Increment campaign.version. Save. Log: `Campaign ${campaignId} status updated to ${update.status}`.

- [x] T013 [US3] Integrate CampaignStatusService into LangGraphRunProcessor in agent-platform/src/run-engine/processors/langgraph-run.processor.ts — inject CampaignStatusService via constructor. After the existing run status update logic (after `runEngineService.updateRunStatus(runId, 'completed')` and the 'failed' branch), extract campaignId from `run.context?.campaignId`. If campaignId exists, call `campaignStatusService.updateStatusFromRun(campaignId, { status: runStatus === 'completed' ? 'live' : 'failed', bundleUrl: (extract from completed run artifacts if available), latestRunId: runId })`. Wrap in try/catch so campaign status update failure doesn't break the run processor. Ensure agent-platform RunEngineModule imports CampaignModule or use forwardRef if circular dependency.

**Checkpoint**: End-to-end flow works: create draft → generate → run completes → campaign status = 'live' with bundleUrl.

---

## Phase 5: US4+US5 — Public Player Endpoints (Priority: P2/P3)

**Goal**: Unauthenticated endpoints for playing generated campaigns, with IP rate limiting.

**Independent Test**: `curl http://localhost:3001/play/:campaignId` for a live campaign returns campaign config and bundleUrl without auth. Returns 404 for non-live campaigns. Embed endpoint sets X-Frame-Options header. Rate limiting triggers 429 after 30 requests in 60 seconds.

### Implementation

- [x] T014 [US4] Implement PublicPlayerController in api-center/src/campaign/public-player.controller.ts — @Controller('play'), apply @Public() decorator (imported from common package, marks routes as bypassing AuthGuard), apply @Throttle({ default: { limit: 30, ttl: 60000 } }) at class level for stricter IP rate limiting (overrides global 100/60s). Inject Campaign Repository.

  `GET /:campaignId` → @Get(':campaignId') getPlayer(@Param('campaignId', ParseUUIDPipe) id). Query: find campaign WHERE id = :id AND status = 'live' AND deletedAt IS NULL (NO tenantId filter — public endpoint). If not found, throw NotFoundException. Set response header Cache-Control: 'public, max-age=300'. Return PublicCampaignResponse: { campaignId: campaign.id, name: campaign.name, templateId: campaign.templateId, bundleUrl: campaign.bundleUrl, config: { theme: campaign.config?.theme, game: campaign.config?.game } }. Do NOT return tenantId, userId, or internal metadata.

  `GET /:campaignId/embed` → @Get(':campaignId/embed') getEmbed(@Param('campaignId', ParseUUIDPipe) id, @Res({ passthrough: true }) res). Same logic as getPlayer but additionally set response headers: X-Frame-Options: 'ALLOWALL', Content-Security-Policy: 'frame-ancestors *'. Return same PublicCampaignResponse.

**Checkpoint**: Public player endpoints return campaign data without auth. Rate limiting verified.

---

## Phase 6: Minimal UI Test Harness

**Purpose**: Simple Vue page to exercise backend APIs — NOT production UI. Just enough to create, list, and manage campaigns from the browser.

- [x] T015 [P] Create campaign API client in webapp/src/services/campaign.service.ts — follow singleton class pattern from webapp/src/services/chat.service.ts. Private basePath = '/campaigns'. Import apiClient from './api/api-client.service'. Methods: list(query?: CampaignListQuery), getById(id: string), create(data: { name: string, templateId: string, config?: any }), update(id: string, data: { name?: string, config?: any, expectedVersion?: number }), remove(id: string), duplicate(id: string, name?: string), generate(id: string), archive(id: string), restore(id: string), bulkArchive(ids: string[]), bulkDelete(ids: string[]), getPlayerData(id: string) (GET /play/:id), getCampaignRuns(campaignId: string, query?: any). Export singleton instance.

- [x] T016 [P] Create campaign Pinia store in webapp/src/stores/campaign.store.ts — follow composition API pattern from webapp/src/stores/chat.store.ts. State: campaigns ref([]), selectedCampaign ref(null), loading ref(false), error ref(null). Actions: fetchCampaigns(query?), createCampaign(data), updateCampaign(id, data), deleteCampaign(id), duplicateCampaign(id, name?), generateCampaign(id), archiveCampaign(id), restoreCampaign(id). Each action sets loading, calls campaignService, updates state, catches errors.

- [x] T017 Create minimal CampaignsPage.vue in webapp/src/pages/CampaignsPage.vue — simple test harness page using PrimeVue components. Include: (1) DataTable showing campaigns with columns: name, templateId, status (with color-coded Badge), updatedAt; (2) "New Campaign" button opening a Dialog with name input + templateId dropdown (spin-wheel, scratch-card, quiz, memory-match); (3) Action buttons per row based on status: Generate (draft/failed), Duplicate (any), Archive (live), Restore (archived), Delete (draft/failed/archived) using PrimeVue Button; (4) Status filter dropdown above table; (5) Basic Toast for success/error feedback. Use campaign store for state management. This is a test harness — keep it functional, not beautiful.

- [x] T018 Add /campaigns route to webapp router in webapp/src/router/index.ts — add to the AppLayout children array (alongside existing /chat and /game-creation routes): { path: '/campaigns', name: 'campaigns', component: () => import('@/pages/CampaignsPage.vue') }. Add navigation link to sidebar/nav if one exists.

**Checkpoint**: Can create, list, edit, generate, and manage campaigns from the browser at http://localhost:5173/campaigns.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, build verification, and cleanup.

- [x] T019 Rebuild all packages and verify compilation — run: `pnpm --filter @agentic-template/dto build && pnpm --filter @agentic-template/common build && pnpm --filter dao build && pnpm --filter api-center build && pnpm --filter agent-platform build`. Fix any TypeScript compilation errors.

- [x] T020 Validate quickstart.md end-to-end — start all services, then run through all curl commands in specs/012-campaign-ui/quickstart.md: create campaign, list campaigns, update config with expectedVersion, trigger generation, check run status, test public player endpoint. Verify correct HTTP status codes and response shapes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all feature work
- **Phase 3 (US1+US2)**: Depends on Phase 2 — core CRUD and lifecycle
- **Phase 4 (US3)**: Depends on Phase 2 — can start in parallel with Phase 3 (different service: agent-platform)
- **Phase 5 (US4+US5)**: Depends on Phase 3 — uses CampaignModule in api-center (PublicPlayerController registered in same module)
- **Phase 6 (Minimal UI)**: Depends on Phase 3 — needs API endpoints to call
- **Phase 7 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1+US2 (Phase 3)**: Start after Phase 2 — no dependencies on other stories
- **US3 (Phase 4)**: Can start after Phase 2 — runs in parallel with Phase 3 (different service)
- **US4+US5 (Phase 5)**: Depends on Phase 3 — PublicPlayerController lives in CampaignModule
- **US6 (Bulk Ops)**: Included in Phase 3 (T010/T011) — no separate phase needed

### Within Each Phase

- DTOs before entity (Phase 1: T001/T002 parallel, then T003, then T004)
- Build before migration (Phase 2: T005 → T006 → T007, then T008/T009 parallel)
- Service before controller (Phase 3: T010 → T011)
- Status service before processor integration (Phase 4: T012 → T013)

### Parallel Opportunities

- T001 and T002 can run in parallel (independent DTO files)
- T008 and T009 can run in parallel (different services: api-center vs agent-platform)
- Phase 3 and Phase 4 can run in parallel (api-center vs agent-platform)
- T015 and T016 can run in parallel (different webapp files)

---

## Parallel Example: Phase 1

```bash
# Launch independent DTO files together:
Task: "Create CampaignConfig interfaces in dto/src/campaign/campaign-config.interface.ts"
Task: "Create CampaignListQuery DTO in dto/src/campaign/campaign-list-query.dto.ts"

# Then sequentially (T003 depends on T001):
Task: "Create Campaign DTOs in dto/src/campaign/campaign.dto.ts"
Task: "Create Campaign entity in dao/src/entities/campaign.entity.ts"
```

## Parallel Example: Phase 3 + Phase 4

```bash
# These can run in parallel (different services):
Task: "Implement CampaignApiService in api-center" (Phase 3)
Task: "Implement CampaignStatusService in agent-platform" (Phase 4)
```

---

## Implementation Strategy

### MVP First (Phase 1 → 2 → 3)

1. Complete Phase 1: Setup — DTOs, entity
2. Complete Phase 2: Foundational — build, migration, module registration
3. Complete Phase 3: US1+US2 — Campaign CRUD & lifecycle
4. **STOP and VALIDATE**: Test all CRUD + lifecycle endpoints with curl
5. This delivers a working campaign backend with create, edit, generate, archive, delete

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1+US2 (Phase 3) → Test CRUD + lifecycle → **MVP!**
3. Add US3 (Phase 4) → Test status integration → Campaigns auto-update on run completion
4. Add US4+US5 (Phase 5) → Test public player → Campaigns playable without auth
5. Add Minimal UI (Phase 6) → Test from browser → Visual verification
6. Polish (Phase 7) → Final build validation

---

## Notes

- [P] tasks = different files, no dependencies on each other
- [Story] label maps task to specific user story for traceability
- US6 (Bulk Operations) is folded into Phase 3 since bulk endpoints share the same service/controller
- No test tasks generated — tests not explicitly requested in spec
- The generate endpoint reuses existing RunEngineApiService.triggerRun() — no new queue infrastructure needed
- Campaign status update in agent-platform is a direct service call, not HTTP callback or queue job
- Public player endpoints use @Public() decorator to bypass AuthGuard and @Throttle() to override global rate limit
