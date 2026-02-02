# Data Model: Default Workflow Pack

**Feature**: 007-default-workflow-pack
**Date**: 2026-02-02

---

## Overview

This feature introduces workflow YAML definitions and the services to load/parse them. The data model consists of:
1. **Workflow YAML structure** - file-based workflow definitions
2. **Input selector types** - declarative input mapping configuration
3. **RunContext extension** - base run support for update workflows

No new database entities are required - workflows are system-level definitions loaded from filesystem, and runs use existing `Run`, `RunStep`, `StepCache`, `Artifact` tables.

---

## 1. Workflow YAML Structure

### WorkflowYaml (Raw YAML representation)

```typescript
// agent-platform/src/run-engine/interfaces/workflow-yaml.interface.ts

interface WorkflowYaml {
  workflow_name: string;      // e.g., "campaign.build"
  version: string;            // semver, e.g., "1.0.0"
  description?: string;
  steps: WorkflowStepYaml[];
}

interface WorkflowStepYaml {
  step_id: string;            // unique within workflow
  skill_id: string;           // references skill catalog
  depends_on: string[];       // step_ids this step waits for
  description?: string;
  input_selector: InputSelectorYaml;
  cache_policy?: CachePolicyYaml;
  retry_policy?: RetryPolicyYaml;
}

interface CachePolicyYaml {
  enabled: boolean;
  scope: 'global' | 'run_only';
}

interface RetryPolicyYaml {
  max_attempts: number;
  backoff_ms: number;
}
```

### Validation Rules

| Field | Constraint |
|-------|------------|
| `workflow_name` | `/^[a-z][a-z0-9._]*$/` (lowercase, starts with letter) |
| `version` | Valid semver (validated via `semver.valid()`) |
| `step_id` | `/^[a-z][a-z0-9_]*$/`, unique within workflow |
| `skill_id` | Must exist in SkillCatalogService |
| `depends_on` | Each element must be a valid `step_id` in same workflow |

---

## 2. Input Selector Types

### InputSelectorYaml (YAML representation)

```typescript
// agent-platform/src/run-engine/interfaces/input-selector.interface.ts

type InputSelectorYaml = Record<string, InputSelectorFieldYaml>;

type InputSelectorFieldYaml =
  | TriggerSourceSelector
  | StepOutputSourceSelector
  | BaseRunSourceSelector
  | RegistrySourceSelector
  | ConstantsSourceSelector
  | MergeOperationSelector
  | PickOperationSelector;

// Source selectors - retrieve data from a source
interface TriggerSourceSelector {
  source: 'trigger';
  path: string;           // JSONPath-like, e.g., "brief.constraints.duration"
}

interface StepOutputSourceSelector {
  source: 'step_output';
  step_id: string;        // e.g., "plan"
  path: string;           // e.g., "data.style_guide"
}

interface BaseRunSourceSelector {
  source: 'base_run';
  step_id: string;        // step from base run
  path: string;           // e.g., "artifacts[0].url"
}

interface RegistrySourceSelector {
  source: 'registry';
  type: 'prompt' | 'config' | 'rubric';
  id: string;
  version?: string;       // optional, defaults to latest
}

interface ConstantsSourceSelector {
  source: 'constants';
  value: unknown;         // any JSON-serializable value
}

// Operation selectors - transform data
interface MergeOperationSelector {
  operation: 'merge';
  inputs: InputSelectorFieldYaml[];
}

interface PickOperationSelector {
  operation: 'pick';
  input: InputSelectorFieldYaml;
  keys: string[];
}
```

### Examples

```yaml
# Trigger source
input_selector:
  campaign_brief:
    source: trigger
    path: brief

# Step output source
input_selector:
  style_guide:
    source: step_output
    step_id: plan
    path: data.style_guide

# Base run source (for update workflows)
input_selector:
  original_intro_image:
    source: base_run
    step_id: intro_image
    path: artifacts[0].url

# Registry source
input_selector:
  prompt_id:
    source: registry
    type: prompt
    id: campaign_plan
    version: "1.0.0"

# Constants source
input_selector:
  default_duration:
    source: constants
    value: 30

# Merge operation
input_selector:
  combined_params:
    operation: merge
    inputs:
      - source: trigger
        path: params
      - source: step_output
        step_id: plan
        path: data.defaults
```

---

## 3. Workflow Index Structure

### WorkflowIndexYaml

```typescript
// agent-platform/src/run-engine/interfaces/workflow-yaml.interface.ts

interface WorkflowIndexYaml {
  version: string;          // index schema version
  updated_at: string;       // ISO 8601 timestamp
  workflows: WorkflowIndexEntry[];
}

interface WorkflowIndexEntry {
  workflow_name: string;
  version: string;
  file?: string;            // optional, defaults to "{workflow_name}.v{version}.yaml"
  status: 'active' | 'deprecated' | 'experimental';
}
```

### Example Index File

```yaml
# agent-platform/workflows/index.yaml
version: "1.0.0"
updated_at: "2026-02-02T00:00:00Z"
workflows:
  - workflow_name: campaign.build
    version: "1.0.0"
    status: active
  - workflow_name: campaign.update_audio
    version: "1.0.0"
    status: active
  - workflow_name: campaign.update_intro
    version: "1.0.0"
    status: active
  - workflow_name: campaign.update_outcome
    version: "1.0.0"
    status: active
  - workflow_name: campaign.update_game_config
    version: "1.0.0"
    status: active
  - workflow_name: campaign.replace_3d_asset
    version: "1.0.0"
    status: active
```

---

## 4. RunContext Extension

### Extended RunContext Interface

```typescript
// dto/src/run-engine/run-context.dto.ts (MODIFICATION)

export interface StepOutput {
  stepId: string;
  status: 'completed' | 'skipped' | 'failed';
  outputArtifactIds: string[];
  data?: Record<string, unknown>;
}

export interface RunContext {
  // Existing fields (unchanged)
  runId: string;
  tenantId: string;
  workflowName: string;
  triggerPayload: Record<string, unknown>;
  stepOutputs: Map<string, StepOutput>;
  artifacts: Map<string, string[]>;

  // NEW: Base run support for update workflows
  baseRunId?: string;
  baseRunOutputs?: Map<string, StepOutput>;
  baseRunArtifacts?: Map<string, string[]>;
}
```

### Population Logic

For update workflows:
1. Extract `base_run_id` from `triggerPayload`
2. Validate base run exists and is `completed`
3. Load base run's step outputs into `baseRunOutputs`
4. Load base run's artifacts into `baseRunArtifacts`

---

## 5. Compiled Selector Function

### After YAML Parsing

```typescript
// The input_selector YAML gets compiled to this function signature
// (already defined in dto/src/run-engine/workflow.dto.ts)

type CompiledInputSelector = (ctx: RunContext) => Record<string, unknown>;

// Example compilation result:
// YAML:
//   campaign_brief:
//     source: trigger
//     path: brief
//
// Compiles to:
const compiledFn: CompiledInputSelector = (ctx) => ({
  campaign_brief: get(ctx.triggerPayload, 'brief'),
});
```

---

## 6. Type Mapping Summary

| YAML Type | TypeScript Interface | Location |
|-----------|---------------------|----------|
| Workflow file | `WorkflowYaml` | `run-engine/interfaces/workflow-yaml.interface.ts` |
| Workflow step | `WorkflowStepYaml` | `run-engine/interfaces/workflow-yaml.interface.ts` |
| Input selector | `InputSelectorYaml` | `run-engine/interfaces/input-selector.interface.ts` |
| Selector field | `InputSelectorFieldYaml` | `run-engine/interfaces/input-selector.interface.ts` |
| Index file | `WorkflowIndexYaml` | `run-engine/interfaces/workflow-yaml.interface.ts` |
| Compiled workflow | `WorkflowSpec` | `dto/src/run-engine/workflow.dto.ts` (existing) |
| Compiled step | `StepSpec` | `dto/src/run-engine/workflow.dto.ts` (existing) |
| Run context | `RunContext` | `dto/src/run-engine/run-context.dto.ts` (extended) |

---

## 7. Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FILESYSTEM (startup)                          │
├─────────────────────────────────────────────────────────────────────┤
│  workflows/index.yaml                                                │
│       │                                                              │
│       ▼                                                              │
│  workflows/*.yaml ──────┐                                            │
│       │                 │                                            │
│       ▼                 ▼                                            │
│  WorkflowYaml     InputSelectorYaml                                  │
│       │                 │                                            │
│       │ [compile]       │ [compile]                                  │
│       ▼                 ▼                                            │
│  WorkflowSpec ◄─── StepSpec.inputSelector                           │
│       │                                                              │
│       ▼                                                              │
│  WorkflowRegistryService (in-memory)                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ [runtime: workflow requested]
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DATABASE (runtime)                            │
├─────────────────────────────────────────────────────────────────────┤
│  Run ─────────────────► RunStep                                      │
│   │                        │                                         │
│   │                        ▼                                         │
│   │                    StepCache                                     │
│   │                        │                                         │
│   ▼                        ▼                                         │
│  RunContext ◄──────── Artifact                                       │
│   │                                                                  │
│   │ [if update workflow]                                             │
│   ▼                                                                  │
│  baseRunOutputs ◄──── (base Run's data)                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Validation Schemas (JSON Schema)

See `contracts/workflow-yaml.schema.json` for the complete Ajv validation schema.
