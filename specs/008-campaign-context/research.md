# Research: Campaign Context Model

**Feature**: 008-campaign-context
**Date**: 2026-02-03

## Research Questions

### RQ-001: Storage Strategy for CampaignContext

**Question**: Should CampaignContext be stored as a JSONB column in the Run entity or as a separate entity?

**Decision**: Store as JSONB column (`context`) in the existing Run entity

**Rationale**:
- CampaignContext has a 1:1 relationship with Run - every run has exactly one context
- JSONB allows flexible schema evolution (new reference types) without migrations
- Existing Run entity already stores `triggerPayload` as JSONB - consistent pattern
- Context operations are always run-scoped, so JOIN is not needed
- PostgreSQL JSONB supports efficient field access and indexing if needed later
- Simpler implementation with fewer entities to maintain

**Alternatives Considered**:
1. **Separate CampaignContext entity**: Rejected because it adds unnecessary JOIN overhead and duplication (campaign_id, run_id, workflow_name already in Run)
2. **Redis/Valkey for fast access**: Rejected because context must persist for crash recovery (FR-011) and audit; PostgreSQL checkpointer already handles this

---

### RQ-002: Reference Type Registry Implementation

**Question**: How should extensible reference types (FR-013) be implemented?

**Decision**: Static TypeScript enum for standard types + JSON Schema validation for custom types registered at startup

**Rationale**:
- Standard 12 reference types are well-defined and stable - compile-time safety via TypeScript enum
- Custom types can be registered in a configuration file validated against JSON Schema at startup
- Reference type validation happens at runtime when attaching artifacts
- No database storage needed for type registry - filesystem configuration is sufficient

**Implementation**:
```typescript
// Standard types (compile-time safe)
enum StandardArtifactReferenceType {
  PLAN = 'plan',
  INTRO_IMAGE = 'intro_image',
  INTRO_VIDEO = 'intro_video',
  // ... all 12 types
}

// Custom types loaded from config at startup
interface ReferenceTypeRegistry {
  standardTypes: Set<string>;
  customTypes: Set<string>;
  isValidType(type: string): boolean;
}
```

**Alternatives Considered**:
1. **Database table for type registry**: Rejected because types rarely change and don't need runtime modification
2. **Free-form strings without validation**: Rejected because it allows typos and inconsistent naming

---

### RQ-003: Context Resolver Lookup Strategy

**Question**: How should ContextResolver.getRef() map logical names to artifacts?

**Decision**: Two-level lookup: refs map → artifacts map

**Rationale**:
- Logical reference names (e.g., "plan") map to artifact IDs in `refs` object
- Artifact IDs map to full artifact data in `artifacts` map
- This matches the spec structure and enables efficient lookup without database queries
- The context is self-contained after loading - no external lookups needed

**Implementation**:
```typescript
interface CampaignContext {
  refs: Record<string, string | undefined>;  // refName → artifactId
  artifacts: Record<string, ArtifactData>;    // artifactId → data
}

// Resolver lookup
getRef(refName: string): ArtifactData | undefined {
  const artifactId = this.context.refs[`${refName}_artifact_id`];
  if (!artifactId) return undefined;
  return this.context.artifacts[artifactId];
}
```

---

### RQ-004: Context Loading from Previous Run

**Question**: How should ContextLoader.fromRun() populate context from a base run?

**Decision**: Query RunStep and Artifact tables, reconstruct refs and artifacts maps

**Rationale**:
- Existing Run, RunStep, and Artifact entities contain all necessary data
- RunStep.outputArtifactIds contains artifact IDs produced by each step
- Artifact entity has type field used to determine which ref to populate
- Loading is a one-time operation at workflow start - query overhead is acceptable

**Implementation Flow**:
1. Load base Run by ID and tenantId (security check)
2. Query all Artifacts where runId = baseRunId
3. For each Artifact: add to artifacts map, update appropriate ref based on artifact.type
4. Query RunSteps for additional metadata (e.g., inputHashes for computed area)

---

### RQ-005: Context Update Strategy for Step Results

**Question**: How should ContextUpdater.attachStepResult() update references automatically?

**Decision**: Convention-based mapping: artifact.type → `${artifact.type}_artifact_id` ref

**Rationale**:
- Spec assumption: "Reference names follow a convention of `{artifact_type}_artifact_id`"
- This enables automatic ref updates without explicit mapping configuration
- Artifact type is authoritative for determining the ref to update
- Multiple artifacts from same step update their respective refs

**Implementation**:
```typescript
attachStepResult(stepId: string, artifacts: ArtifactData[]): void {
  for (const artifact of artifacts) {
    const artifactId = generateUuid();
    this.context.artifacts[artifactId] = artifact;

    const refName = `${artifact.type}_artifact_id`;
    if (this.registry.isValidType(artifact.type)) {
      this.context.refs[refName] = artifactId;
    }
  }
}
```

---

### RQ-006: Persistence Trigger and Mechanism

**Question**: How should context persistence after each step (FR-011) be implemented?

**Decision**: Leverage existing PostgreSQL checkpointer via LangGraph state updates

**Rationale**:
- WorkflowEngineService already uses PostgresSaver for checkpointing
- CampaignContext as part of workflow state is automatically persisted on each state update
- No additional persistence mechanism needed - piggyback on existing infrastructure
- Crash recovery works via checkpointId resumption (already implemented)

**Integration**:
- CampaignContext becomes part of the workflow state interface
- Each step updates context → state update → automatic checkpoint
- Context is restored when resuming from checkpoint

---

### RQ-007: Artifact ID Uniqueness Validation

**Question**: How should artifact ID uniqueness (FR-008) be enforced?

**Decision**: Generate UUIDs server-side; validate uniqueness in-memory before adding to artifacts map

**Rationale**:
- UUIDs are globally unique by design - collision is statistically impossible
- In-memory check is a safety net for any edge cases
- No database constraint needed since artifacts map is context-local
- Artifact table in database has its own UUID primary key

**Implementation**:
```typescript
attachArtifact(artifact: ArtifactData): string {
  const artifactId = generateUuid();
  if (this.context.artifacts[artifactId]) {
    throw new Error(`Artifact ID collision: ${artifactId}`);
  }
  this.context.artifacts[artifactId] = artifact;
  return artifactId;
}
```

---

### RQ-008: Computed Data Structure

**Question**: How should the computed scratch area (FR-006) be structured?

**Decision**: Typed sub-objects for input_hashes_by_step and quality_checks

**Rationale**:
- Spec defines two specific computed data types
- Structured objects enable type-safe access
- Still flexible enough to add new computed data types without breaking changes
- Quality checks should include artifact reference, check type, status, and optional details

**Implementation**:
```typescript
interface ComputedData {
  inputHashesByStep: Record<string, string>;  // stepId → inputHash
  qualityChecks: QualityCheckResult[];
}

interface QualityCheckResult {
  artifactId: string;
  checkType: string;
  status: 'passed' | 'failed' | 'warning';
  message?: string;
  timestamp: string;
}
```

---

## Best Practices Applied

### BP-001: Existing Patterns Used

- **BaseEntity pattern**: Not needed for CampaignContext (JSONB in Run, not separate entity)
- **TenantClsService**: Context operations inherit tenant from Run entity
- **JSONB storage**: Matches existing triggerPayload pattern in Run
- **Result objects**: ContextResolver returns undefined for missing refs (not exceptions)

### BP-002: Error Handling Strategy

- Resolver returns `undefined` for missing artifacts (expected case)
- Throws structured errors for invalid operations (duplicate artifact ID)
- Context loading errors include base_run_id in message for debugging
- All errors logged with correlation ID from workflow context

### BP-003: Type Safety Approach

- TypeScript interfaces for CampaignContext, ArtifactData, ComputedData
- class-validator decorators for DTOs exposed via API (if any)
- JSON Schema for reference type configuration file
- Strict null checks - all optional fields explicitly marked

---

## Dependencies Confirmed

| Dependency | Version | Purpose | Source |
|------------|---------|---------|--------|
| TypeORM | 0.3.x | Database access, Run entity | Existing in dao |
| class-validator | 0.14.x | DTO validation | Existing in dto |
| uuid | 9.x | Artifact ID generation | Existing in common |
| Ajv | 8.x | JSON Schema validation | Existing in common |

No new dependencies required - all functionality can be built with existing packages.

---

## Conclusion

All research questions resolved. The CampaignContext implementation will:
1. Store context as JSONB column in Run entity (RQ-001)
2. Use TypeScript enum + JSON Schema config for reference types (RQ-002)
3. Implement two-level lookup for resolver (RQ-003)
4. Query existing tables for context loading (RQ-004)
5. Use convention-based ref updates (RQ-005)
6. Leverage LangGraph checkpointer for persistence (RQ-006)
7. Generate server-side UUIDs with in-memory validation (RQ-007)
8. Use typed sub-objects for computed data (RQ-008)

Ready for Phase 1: Design & Contracts.
