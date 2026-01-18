# Spec 7 — Default Workflow Pack v1 (Campaign Build + Update Workflows)

## Goal
Ship a ready-to-run set of workflow definitions that connect the **recommended skills** into:
1) an initial end-to-end build workflow
2) update workflows that support partial rebuild (audio/intro/outcome/game-config/3D)

This is still **core platform only**: no UI, no serving/CDN infra.

---

## Workflow Registry Layout (repo)
- `/workflows/index.yaml`
- `/workflows/campaign.build.v1.yaml`
- `/workflows/campaign.update_audio.v1.yaml`
- `/workflows/campaign.update_intro.v1.yaml`
- `/workflows/campaign.update_outcome.v1.yaml`
- `/workflows/campaign.update_game_config.v1.yaml`
- `/workflows/campaign.replace_3d_asset.v1.yaml`

Each workflow file defines:
- `workflow_name`, `version`
- `steps[]` with `step_id`, `skill_id`, `depends_on[]`
- `input_selector` config (declarative mapping)
- optional `cache_policy`, `retry_policy`

---

## Declarative Input Selectors (MVP)
To avoid embedding complex JS logic inside workflow definitions, use a simple declarative mapping.

### Input Selector Sources
- `trigger`: the run trigger payload (initial brief or change request)
- `step_output`: previous step artifacts and metadata
- `registry`: prompt/config/rubric ids and versions
- `constants`: fixed parameters

### Mapping operations (minimal)
- `get(path)` : JSONPath-like lookup
- `merge([...objects])`
- `pick(obj, keys[])`
- `literal(value)`

Implementation can be a small interpreter in `WorkflowRegistryService`.

---

## Workflow 7.1 — `campaign.build.v1` (end-to-end)

### Trigger payload (example)
- `campaign_id`
- `brief` (text)
- `brand_assets[]` (uris)
- `constraints` (duration, style, language, etc.)
- `template_candidates[]` (optional)

### Steps (DAG)
1. `plan` → `campaign_plan_from_brief`
2. `intro_image` → `generate_intro_image` (depends on `plan`)
3. `intro_button_segmentation` → `segment_start_button` (depends on `intro_image`)
4. `intro_video` → `generate_intro_video_loop` (depends on `intro_image`)
5. `bgm` → `generate_bgm_track` (depends on `plan`)
6. `sfx` → `generate_sfx_pack` (depends on `plan`)
7. `audio_mix` → `mix_audio_for_game` (depends on `bgm`, `sfx`)
8. `game_config` → `game_config_from_template` (depends on `plan`)
9. `bundle_game` → `bundle_game_template` (depends on `audio_mix`, `game_config`)
10. `outcome_win` → `generate_outcome_video_win` (depends on `plan`)
11. `outcome_lose` → `generate_outcome_video_lose` (depends on `plan`)
12. `manifest` → `assemble_campaign_manifest` (depends on segmentation, intro video, bundle, outcomes)
13. `qa_bundle` → `validate_game_bundle` (depends on `bundle_game`)
14. `review_smoke` → `review_asset_quality` (depends on `manifest`) (optional)

Notes:
- `assemble_campaign_manifest` should be deterministic.
- `review_asset_quality` is the place to use Claude critique.

---

## Workflow 7.2 — `campaign.update_audio.v1`

### Trigger payload
- `campaign_id`
- `base_run_id`
- `audio`: `{ bgm_prompt?, bgm_style?, bpm?, sfx_list?, loudness_target? }`

### Steps
1. `bgm`
2. `sfx`
3. `audio_mix`
4. `bundle_game`
5. `manifest`
6. `qa_bundle`

---

## Workflow 7.3 — `campaign.update_intro.v1`

### Trigger payload
- `campaign_id`
- `base_run_id`
- `intro`: `{ prompt_override?, style_ref?, brand_assets_override? }`

### Steps
1. `intro_image`
2. `intro_button_segmentation`
3. `intro_video`
4. `manifest`
5. `review_smoke` (optional)

---

## Workflow 7.4 — `campaign.update_outcome.v1`

### Trigger payload
- `campaign_id`
- `base_run_id`
- `outcome`: `{ win_prompt_override?, lose_prompt_override? }`

### Steps
1. `outcome_win`
2. `outcome_lose`
3. `manifest`
4. `review_smoke` (optional)

---

## Workflow 7.5 — `campaign.update_game_config.v1`

### Trigger payload
- `campaign_id`
- `base_run_id`
- `game`: `{ difficulty?, speed?, target_score?, theme_override? }`

### Steps
1. `game_config`
2. `bundle_game`
3. `manifest`
4. `qa_bundle`

---

## Workflow 7.6 — `campaign.replace_3d_asset.v1` (optional)

### Trigger payload
- `campaign_id`
- `base_run_id`
- `asset3d`: `{ prompt, style, format, poly_budget }`

### Steps
1. `generate_3d_asset`
2. `optimize_3d_asset`
3. `bundle_game`
4. `manifest`
5. `qa_bundle`

---

## Reuse Strategy: Base Run Inputs
For update workflows, the input selector should:
- default to `base_run_id` artifacts and plan/config
- overlay the change request fields

---

## Deliverables
- Workflow YAML files for v1 workflows
- A small declarative `InputSelectorInterpreter`
- A `WorkflowRegistryService` that loads workflows and exposes them to Run Engine
