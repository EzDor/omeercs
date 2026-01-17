# Spec 1 — Skills Catalog (Core Agentic Platform)

## Goal
Define a **manual, typed catalog of Skills** that the orchestrator can call to build and update campaigns.
A Skill is a bounded capability with strict input/output schemas and well-defined artifact outputs.

## Principles
- **Manual-first**: skills are implemented by code/tools you own (not “AI writes everything”).
- **Typed I/O**: every skill has JSON Schema input/output.
- **Composable**: workflows call skills; skills do not own global orchestration.
- **Cacheable**: skills should be safe to reuse by `(skill_id, version, input_hash)` when possible (best effort).
- **Provider-agnostic**: skills call a thin provider wrapper; provider choice is an input parameter.

---

## Skill Contract (required fields)

### SkillDescriptor
- `skill_id` (string, stable)
- `version` (semver string)
- `title` (short name)
- `description`
- `tags` (e.g., `audio`, `video`, `3d`, `game`, `packaging`, `qa`)
- `input_schema` (JSON Schema)
- `output_schema` (JSON Schema)
- `implementation`
  - `type`: `ts_function | http_call | cli_command`
  - `handler`: module path / URL / command template
- `produces_artifacts`: list of artifact descriptors
- `policy`
  - `max_runtime_sec`
  - `network`: `none | allowlist`
  - `fs`: allowed read/write prefixes (optional)
- `observability`
  - `log_level_default`
  - `emit_metrics` (bool)

### SkillResult (standard output envelope)
- `ok: boolean`
- `data`: matches `output_schema` when ok
- `artifacts[]`:
  - `artifact_type` (e.g., `audio/wav`, `video/mp4`, `model/gltf`, `json/config`)
  - `uri` (object storage path or local path depending on env)
  - `content_hash` (best-effort)
  - `metadata` (provider/model, duration, resolution, etc.)
- `debug`:
  - `logs_uri?`
  - `timings_ms`
  - `provider_calls[]` (optional)

---

## Catalog Storage (MVP)
Store skills as repo files:
- `/skills/catalog/index.yaml` (list + metadata)
- `/skills/catalog/<skill_id>.yaml` (full descriptor)

At runtime, `SkillCatalogService` loads and validates descriptors on startup.

---

## Recommended MVP Skill Set (for your interactive campaign flow)

### A) Campaign planning & configuration (bounded AI usage)
1. `campaign_plan_from_brief`
   - Input: brief + brand assets refs + constraints
   - Output: structured plan (theme, tone, required assets, game template choice, video prompts)
   - Uses Claude for structured JSON output (schema-validated)

2. `game_config_from_template`
   - Input: chosen template + difficulty + theme + asset refs
   - Output: `game_config.json` (schema-validated)
   - Uses Claude for config generation, NOT arbitrary code

3. `review_asset_quality`
   - Input: artifact refs + rubric id
   - Output: `{pass, issues[], suggested_fixes[]}`
   - Uses Claude for critique

### B) Intro video pipeline
4. `generate_intro_image`
   - Input: prompt + brand assets + style refs
   - Output: base frame image

5. `segment_start_button`
   - Input: image uri
   - Output: button bounds + mask polygon + confidence

6. `generate_intro_video_loop`
   - Input: image uri + motion params (subtle loop)
   - Output: intro mp4

### C) Outcome video pipeline
7. `generate_outcome_video_win`
   - Input: theme + assets + duration + generic “win” text (NO coupon)
   - Output: win mp4

8. `generate_outcome_video_lose`
   - Input: theme + assets + duration + generic “lose” text
   - Output: lose mp4

### D) Audio pipeline
9. `generate_bgm_track`
   - Input: style + bpm + duration + loopable flag
   - Output: bgm audio file

10. `generate_sfx_pack`
   - Input: list of sfx names/intents (jump, coin, click, win, lose)
   - Output: zip/manifest of sfx

11. `mix_audio_for_game`
   - Input: bgm + sfx pack + loudness targets
   - Output: normalized assets + manifest

### E) 3D asset pipeline (if needed for templates)
12. `generate_3d_asset`
   - Input: text prompt + style + target format (glb/gltf) + poly budget
   - Output: model file(s)

13. `optimize_3d_asset`
   - Input: model uri + constraints (polycount, textures)
   - Output: optimized model

### F) Game bundling & packaging
14. `bundle_game_template`
   - Input: template_id + `game_config.json` + assets (images/audio/3d)
   - Output: web bundle (static files) + `bundle_manifest.json`

15. `validate_game_bundle`
   - Input: bundle uri
   - Output: `{pass, issues[]}`

### G) Publishable campaign manifest
16. `assemble_campaign_manifest`
   - Input: intro video uri + outcome uris + game bundle uri + button bounds + rules
   - Output: `campaign_manifest.json`

---

## Implementation Progress

Track which skills have been implemented:

### A) Campaign planning & configuration
- [x] `campaign_plan_from_brief` — Generate structured campaign plan from brief
- [x] `game_config_from_template` — Generate game config JSON from template
- [x] `review_asset_quality` — AI-powered asset quality review

### B) Intro video pipeline
- [ ] `generate_intro_image` — Generate base frame image
- [ ] `segment_start_button` — Detect button bounds in image
- [ ] `generate_intro_video_loop` — Create looping intro video

### C) Outcome video pipeline
- [ ] `generate_outcome_video_win` — Generate win outcome video
- [ ] `generate_outcome_video_lose` — Generate lose outcome video

### D) Audio pipeline
- [ ] `generate_bgm_track` — Generate background music
- [ ] `generate_sfx_pack` — Generate sound effects pack
- [ ] `mix_audio_for_game` — Mix and normalize audio assets

### E) 3D asset pipeline
- [ ] `generate_3d_asset` — Generate 3D model from prompt
- [ ] `optimize_3d_asset` — Optimize 3D model for web

### F) Game bundling & packaging
- [ ] `bundle_game_template` — Bundle game with assets
- [ ] `validate_game_bundle` — Validate game bundle integrity

### G) Publishable campaign manifest
- [ ] `assemble_campaign_manifest` — Assemble final campaign manifest

**Progress: 3/16 skills implemented**

---

## Update Scenarios (why these skills support partial reruns)
- “Change audio” → rerun `generate_bgm_track`/`generate_sfx_pack`/`mix_audio_for_game` → `bundle_game_template` → `assemble_campaign_manifest`
- “Change intro copy/style” → rerun intro image/video + segmentation if needed → update manifest
- “Change difficulty/theme” → rerun `game_config_from_template` → bundle → manifest
- “Replace 3D model” → rerun `generate_3d_asset`/`optimize_3d_asset` → bundle → manifest

---

## What is NOT a skill (on purpose, MVP)
- Global workflow planning/execution (belongs to Run Engine)
- Coupon issuance / session validation (belongs to backend service)
- UI rendering (campaign player)
