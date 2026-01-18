# Spec 8 — Campaign Context Model (runtime contract passed between steps)

## Goal
Define a single runtime + persisted shape that steps can read/write, so input selectors and skills have a consistent
view of what’s available (plan, artifacts, config, etc.).

This is NOT a DB schema spec; it’s a runtime contract that orchestrator builds as it runs.

---

## CampaignContext (runtime)
- `campaign_id`
- `run_id`
- `workflow_name`
- `trigger`:
  - `type`
  - `payload`
- `refs` (pointers to key artifacts/config by logical name):
  - `plan_artifact_id?`
  - `intro_image_artifact_id?`
  - `intro_video_artifact_id?`
  - `button_segmentation_artifact_id?`
  - `bgm_artifact_id?`
  - `sfx_artifact_id?`
  - `audio_manifest_artifact_id?`
  - `game_config_artifact_id?`
  - `game_bundle_artifact_id?`
  - `outcome_win_video_artifact_id?`
  - `outcome_lose_video_artifact_id?`
  - `campaign_manifest_artifact_id?`
- `artifacts`: map `artifact_id -> {type, uri, hash, metadata}`
- `computed` (optional scratch area):
  - `input_hashes_by_step`
  - `quality_checks`

---

## How it’s used
- Orchestrator updates `refs` as steps complete.
- Input selectors fetch required artifacts via `refs` first, then `artifacts`.
- Update workflows start by populating `CampaignContext` from `base_run_id`:
  - load base run artifacts into `artifacts`
  - populate `refs` from base run step outputs

---

## Deliverables
- TypeScript type/interface for CampaignContext
- Helpers:
  - `ContextLoader.fromRun(base_run_id)`
  - `ContextUpdater.attachStepResult(step_id, artifacts[])`
  - `ContextResolver.getRef("game_bundle") -> artifact`
