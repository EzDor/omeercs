# Quickstart: Default Workflow Pack

**Feature**: 007-default-workflow-pack
**Date**: 2026-02-02

---

## Overview

This guide explains how to:
1. Create a new workflow YAML definition
2. Register it with the workflow registry
3. Trigger a workflow run
4. Create an update workflow referencing a base run

---

## 1. Create a Workflow Definition

Create a YAML file in `agent-platform/workflows/`:

```yaml
# agent-platform/workflows/campaign.build.v1.yaml
workflow_name: campaign.build
version: "1.0.0"
description: End-to-end campaign build from brief

steps:
  - step_id: plan
    skill_id: campaign_plan_from_brief
    depends_on: []
    input_selector:
      brief:
        source: trigger
        path: brief
      brand_assets:
        source: trigger
        path: brand_assets
      constraints:
        source: trigger
        path: constraints
    cache_policy:
      enabled: true
      scope: run_only
    retry_policy:
      max_attempts: 2
      backoff_ms: 1000

  - step_id: intro_image
    skill_id: generate_intro_image
    depends_on: [plan]
    input_selector:
      style_guide:
        source: step_output
        step_id: plan
        path: data.style_guide
      brand_assets:
        source: trigger
        path: brand_assets
```

---

## 2. Add to Workflow Index

Update `agent-platform/workflows/index.yaml`:

```yaml
version: "1.0.0"
updated_at: "2026-02-02T00:00:00Z"
workflows:
  - workflow_name: campaign.build
    version: "1.0.0"
    status: active
```

---

## 3. Trigger a Build Workflow

Send a run request to the API:

```bash
curl -X POST http://localhost:3001/api/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "campaign.build",
    "trigger_payload": {
      "campaign_id": "camp_123",
      "brief": "Create a fun mobile game campaign for a snack brand",
      "brand_assets": [
        { "type": "logo", "url": "https://..." },
        { "type": "colors", "primary": "#FF5733" }
      ],
      "constraints": {
        "duration_sec": 30,
        "language": "en",
        "style": "playful"
      }
    }
  }'
```

Response:

```json
{
  "run_id": "run_abc123",
  "status": "pending",
  "workflow_name": "campaign.build",
  "created_at": "2026-02-02T10:00:00Z"
}
```

---

## 4. Create an Update Workflow

Update workflows reference a base run and only regenerate specific assets.

### Audio Update Example

```yaml
# agent-platform/workflows/campaign.update_audio.v1.yaml
workflow_name: campaign.update_audio
version: "1.0.0"
description: Update audio tracks for existing campaign

steps:
  - step_id: bgm
    skill_id: generate_bgm_track
    depends_on: []
    input_selector:
      # Get style from base run's plan
      style_guide:
        source: base_run
        step_id: plan
        path: data.style_guide
      # Override with new audio params from trigger
      bgm_params:
        source: trigger
        path: audio.bgm_params

  - step_id: sfx
    skill_id: generate_sfx_pack
    depends_on: []
    input_selector:
      sfx_list:
        source: trigger
        path: audio.sfx_list
```

### Trigger an Update

```bash
curl -X POST http://localhost:3001/api/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "campaign.update_audio",
    "trigger_payload": {
      "campaign_id": "camp_123",
      "base_run_id": "run_abc123",
      "audio": {
        "bgm_params": {
          "style": "electronic",
          "bpm": 128
        },
        "sfx_list": ["click", "success", "fail"]
      }
    }
  }'
```

---

## 5. Input Selector Reference

### Source Types

| Source | Description | Example |
|--------|-------------|---------|
| `trigger` | Access trigger payload | `{ source: "trigger", path: "brief" }` |
| `step_output` | Access previous step output | `{ source: "step_output", step_id: "plan", path: "data.style" }` |
| `base_run` | Access base run step output | `{ source: "base_run", step_id: "plan", path: "data" }` |
| `registry` | Access prompt/config registry | `{ source: "registry", type: "config", id: "game_defaults" }` |
| `constants` | Fixed value | `{ source: "constants", value: 30 }` |

### Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| `merge` | Combine objects | `{ operation: "merge", inputs: [...] }` |
| `pick` | Select keys | `{ operation: "pick", input: {...}, keys: ["a", "b"] }` |

---

## 6. Workflow Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                        STARTUP                                   │
├─────────────────────────────────────────────────────────────────┤
│  1. WorkflowYamlLoaderService.onModuleInit()                    │
│  2. Read workflows/index.yaml                                    │
│  3. For each active workflow:                                    │
│     - Parse YAML file                                            │
│     - Validate against schema                                    │
│     - Validate skill_id references exist                         │
│     - Compile input selectors to functions                       │
│     - Register with WorkflowRegistryService                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        RUNTIME                                   │
├─────────────────────────────────────────────────────────────────┤
│  1. API receives run request                                     │
│  2. RunEngineService creates Run + RunStep entities              │
│  3. Job enqueued to BullMQ RUN_ORCHESTRATION queue              │
│  4. LangGraphRunProcessor picks up job                          │
│  5. Fetches WorkflowSpec from registry                          │
│  6. Builds LangGraph StateGraph                                  │
│  7. Executes steps via CachedStepExecutorService                │
│  8. Each step calls SkillRunnerService                          │
│  9. Results stored in RunStep entities                          │
│ 10. Final manifest assembled                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Validation Errors

### Invalid Workflow Name
```
Error: Workflow 'Campaign.Build' has invalid name: must be lowercase alphanumeric with dots/underscores
```

### Unknown Skill Reference
```
Error: Workflow 'campaign.build' references unknown skill: generate_unknown_asset
```

### Cyclic Dependencies
```
Error: Workflow 'campaign.build' has invalid dependencies: cycle detected: step_a -> step_b -> step_a
```

### Invalid Base Run (at runtime)
```
{
  "error": "BASE_RUN_NOT_FOUND",
  "message": "Base run 'run_xyz' not found or not completed",
  "details": { "base_run_id": "run_xyz", "status": "failed" }
}
```

---

## 8. Available Workflows (v1)

| Workflow | Steps | Use Case |
|----------|-------|----------|
| `campaign.build` | 14 | Full campaign from brief |
| `campaign.update_audio` | 6 | Replace BGM/SFX |
| `campaign.update_intro` | 5 | Regenerate intro visuals |
| `campaign.update_outcome` | 4 | Regenerate win/lose videos |
| `campaign.update_game_config` | 4 | Adjust game parameters |
| `campaign.replace_3d_asset` | 5 | Replace 3D model |
