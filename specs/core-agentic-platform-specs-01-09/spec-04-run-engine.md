# Spec 4 — Run Engine (Workflow Orchestrator + Partial Rebuild)

## Goal
Run a workflow end-to-end for an initial build, then support **selective re-runs** when the user asks for a change
(e.g., “change audio”), by reusing unchanged step outputs and rerunning only the impacted steps + downstream dependents.

This spec is **core platform only**: no UI, no infra/CDN details.

---

## Core Concepts

### Workflow
A named DAG of steps.
- Example: `campaign.build.v1`, `campaign.update_audio.v1`

### Run
One execution instance of a workflow.
- Has `run_id`, `workflow_name`, `trigger` (initial|update), `status`, timestamps.

### Step
An atomic unit of work in a workflow.
- Uses exactly **one Skill** (or a small deterministic composition) to keep boundaries clean.

### Artifact
Output produced by a step (video/audio/bundle/json).
- Stored with metadata and referenced by later steps.

### Step Cache (best-effort)
Mapping from `(workflow_step_id + input_hash)` → `artifact_refs`.
Used to reuse results across runs and for partial rebuild.

---

## Requirements

1) **End-to-end first build**
- For an initial workflow run, execute all steps in DAG order.

2) **Partial rebuild from user change**
- Accept a `ChangeRequest`.
- Compute impacted steps.
- Re-run only impacted steps and downstream steps whose input hash changes.
- Reuse cached outputs for all other steps.

3) **Best-effort durability**
- Use BullMQ jobs.
- Retry failed steps (configurable).
- Must be safe to resume a run after worker crash (by checking DB step status).

4) **Idempotency boundaries**
- Step execution must be safe to retry (at least once) without corrupting state.
- Artifact registration should dedupe by content hash if possible.

---

## Data Model (Minimal)

### runs
- `id` (uuid)
- `workflow_name` (string)
- `trigger_type` (`initial` | `update`)
- `trigger_payload` (json)
- `status` (`queued` | `running` | `failed` | `completed` | `cancelled`)
- `created_at`, `updated_at`

### run_steps
- `id` (uuid)
- `run_id` (fk)
- `step_id` (string, stable identifier)
- `status` (`pending` | `running` | `skipped` | `failed` | `completed`)
- `input_hash` (string)
- `started_at`, `ended_at`
- `attempt` (int)
- `error` (json)
- `output_artifact_ids` (json array of artifact ids)

### artifacts
- `id` (uuid)
- `type` (string, e.g. `video/mp4`)
- `uri` (string)
- `content_hash` (string)
- `metadata` (json)
- `created_at`

### step_cache (optional but recommended for MVP speed)
- `cache_key` (string) = `${step_id}:${input_hash}`
- `artifact_ids` (json array)
- `created_at`

---

## Workflow Definition (in code)

### WorkflowSpec
- `workflow_name`
- `version`
- `steps: StepSpec[]`

### StepSpec
- `step_id` (string)
- `skill_id` (string)
- `depends_on: step_id[]`
- `input_selector(ctx) -> object`
- `cache_policy`:
  - `enabled: boolean`
  - `scope: run_only | global`
- `retry_policy`:
  - `max_attempts`
  - `backoff_ms`

---

## Input Hashing (the key to partial rebuild)

### Rule
`input_hash = sha256(canonical_json(skill_input))`

Where `skill_input` is the output of `input_selector(ctx)`.

Canonical JSON requirements:
- stable key ordering
- no undefined values
- normalize floats if needed (keep MVP simple)

---

## ChangeRequest Model

### ChangeRequest
- `type`: one of:
  - `audio.update`
  - `intro.update`
  - `outcome.update`
  - `game_config.update`
  - `asset3d.replace`
  - `full_rebuild`
- `payload`: type-specific json

### Mapping ChangeRequest → impacted step seeds
- `audio.update` → `generate_bgm_track`, `generate_sfx_pack`, `mix_audio_for_game`
- `intro.update` → `generate_intro_image`, `segment_start_button`, `generate_intro_video_loop`
- `game_config.update` → `game_config_from_template`
- `asset3d.replace` → `generate_3d_asset`, `optimize_3d_asset`
- `full_rebuild` → all steps

Then compute downstream closure using DAG edges.

---

## Execution Algorithm

### 1) Create Run
- Persist `runs` row
- Create `run_steps` rows with `pending` status for all steps

### 2) Enqueue Orchestrator Job
- BullMQ job: `workflow.run` with `{ run_id }`

### 3) Orchestrator Loop (inside worker)
For steps in topological order:
1. Check all dependencies are `completed` (or have artifact outputs).
2. Compute `skill_input = input_selector(ctx)`
3. Compute `input_hash`
4. Cache check:
   - if enabled and `step_cache[step_id:input_hash]` exists → mark `skipped` and attach cached artifacts
5. Execute if not cached:
   - mark `running`
   - call `SkillRunner.run(skill_id, skill_input, ctx)`
   - on ok: register artifacts, mark `completed`
   - on fail: mark `failed`, respect `retry_policy`

### Failure modes
- If a step fails after retries → run status `failed`
- Downstream steps remain `pending`

---

## Interfaces (NestJS Services)

### RunEngineService
- `trigger(workflow_name, trigger_payload) -> run_id`
- `triggerUpdate(base_run_id, changeRequest) -> run_id`
- `getRun(run_id)`
- `getRunSteps(run_id)`
- `getRunArtifacts(run_id)`

### WorkflowRegistryService
- `getWorkflow(workflow_name, version?) -> WorkflowSpec`

### DependencyGraphService
- `topologicalSort(steps)`
- `downstreamClosure(step_ids)`

---

## Workflow Example (Campaign Build)
Recommended step DAG (example IDs):
1. `campaign_plan_from_brief`
2. `generate_intro_image` (depends on 1)
3. `segment_start_button` (depends on 2)
4. `generate_intro_video_loop` (depends on 2)
5. `generate_bgm_track` (depends on 1)
6. `generate_sfx_pack` (depends on 1)
7. `mix_audio_for_game` (depends on 5,6)
8. `game_config_from_template` (depends on 1)
9. `bundle_game_template` (depends on 7,8)
10. `generate_outcome_video_win` (depends on 1)
11. `generate_outcome_video_lose` (depends on 1)
12. `assemble_campaign_manifest` (depends on 3,4,9,10,11)
13. `validate_game_bundle` (depends on 9)

---

## MVP Constraints (by design)
- No event sourcing.
- No strict determinism guarantees.
- No heavy sandboxing (tool runs in-process, policy-limited).
- Caching is best-effort and can be disabled per step.

---

## Deliverables
- Workflow registry + StepSpec interfaces
- Run/RunStep/Artifact persistence
- Orchestrator worker using BullMQ
- Input hashing + step cache
- ChangeRequest → impacted steps mapping
