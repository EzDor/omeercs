# Spec 9 — Reference Implementations (Starter Code Map + 3 Concrete Skills + 1 Workflow Run)

## Goal
Provide a minimal but real “starter slice” you can implement immediately:
- A concrete NestJS module layout
- 3 working Skills (1 deterministic, 1 provider call stub, 1 Claude JSON generation)
- A runnable `campaign.build.v1` workflow execution path using Specs 4/7/8
- An example “update audio” run that reuses cached steps

---

## 1) Repo / Module Layout (recommended)

### Packages (monorepo-friendly)
- `apps/worker` (BullMQ processors + orchestrator)
- `libs/core-agentic` (platform core)
- `libs/providers` (thin providers)
- `libs/skills` (skill handlers)
- `libs/registry` (catalog + prompts + workflows)

If you’re not monorepo: keep modules under `src/` with the same boundaries.

### NestJS Modules
- `RegistryModule`
  - `SkillCatalogService`
  - `WorkflowRegistryService`
  - `PromptRegistryService`

- `ProvidersModule`
  - `ProviderRegistry`
  - `AudioProvider` (stub implementation)

- `ArtifactsModule`
  - `ArtifactRegistryService` (DB or file stub)
  - `ContentHashService`

- `SkillsModule`
  - `SkillRunnerService`
  - Skill handler implementations

- `RunEngineModule`
  - `RunEngineService`
  - `ContextLoader`, `ContextUpdater`
  - `DependencyGraphService`

- `WorkerModule`
  - BullMQ processor: `workflow.run`

---

## 2) Minimal Types (copy into `libs/core-agentic`)

### 2.1 SkillDescriptor (runtime)
- `skill_id`, `version`, `input_schema`, `output_schema`, `implementation`, `policy`

### 2.2 SkillHandler interface
- `run(input: any, ctx: SkillContext): Promise<{ data: any, artifacts: ProducedArtifact[] }>`

### 2.3 ProducedArtifact
- `artifact_type: string`
- `path_or_uri: string` (local path in dev OR already-uploaded uri)
- `metadata?: Record<string, any>`

### 2.4 ArtifactRecord
- `id`, `type`, `uri`, `content_hash`, `metadata`

### 2.5 CampaignContext (Spec 8)
- `campaign_id`, `run_id`, `refs`, `artifacts`, `trigger`

---

## 3) Reference Skills to Implement (v1)

### Skill A — `assemble_campaign_manifest` (deterministic)
Purpose: Create `campaign_manifest.json` from known artifact URIs + segmentation bounds + rules.

- Inputs (example):
  - `campaign_id`
  - `intro_video_uri`
  - `button_bounds` (x,y,w,h or polygon)
  - `game_bundle_uri`
  - `outcome_win_uri`
  - `outcome_lose_uri`
  - `rules` (win condition, etc.)

- Output:
  - `manifest_uri`
  - `manifest` (optional echo)

- Artifacts:
  - `json/manifest` (campaign_manifest.json)

Notes:
- No LLM.
- This skill becomes your “truth” for what the player loads.

---

### Skill B — `generate_bgm_track` (provider call stub)
Purpose: Generate a loopable background audio track.

MVP implementation:
- Provide a stub provider that writes a placeholder wav/mp3 file to workspace.
- Later replace stub with real provider call.

- Input:
  - `prompt`
  - `duration_sec`
  - `loopable`
  - `provider_id`

- Output:
  - `audio_uri`
  - `duration_sec`

- Artifact:
  - `audio/wav` (or `audio/mp3`)

---

### Skill C — `game_config_from_template` (Claude JSON generation)
Purpose: Produce `game_config.json` for a known template (no executable code generation).

- Input:
  - `template_id`
  - `difficulty` (easy/med/hard)
  - `theme`
  - `assets` (uris)
  - `constraints` (fps target, mobile, etc.)
  - `prompt_id/version` (from Prompt Registry)

- Output:
  - `game_config_uri`
  - `template_id`

- Artifacts:
  - `json/game_config`

Rules:
- Claude must output JSON only.
- Validate against schema.
- If invalid: 1 retry with “fix JSON to match schema”.

---

## 4) Reference Workflow Wiring (1 real workflow)

### Workflow: `campaign.build.v1` (minimal runnable slice)
To keep this implementable quickly, start with a reduced DAG:

1. `game_config` → `game_config_from_template`
2. `bgm` → `generate_bgm_track`
3. `bundle_game_template` (stub acceptable)
4. `assemble_manifest` → `assemble_campaign_manifest`

This validates: Registry → Runner → Providers → Artifacts → Run Engine → Workflow Registry.

---

## 5) Step Stubs (acceptable for this reference implementation)

### `bundle_game_template` (stub acceptable)
Implementation can:
- create a folder with `index.html` and placeholder JS
- zip it
- register as artifact `bundle/zip`
- return `bundle_uri`

### `intro/outcome videos` placeholders
For the reference run, allow trigger payload to provide:
- `intro_video_uri`, `outcome_win_uri`, `outcome_lose_uri`

---

## 6) Concrete “Run” example (end-to-end)

### 6.1 Trigger payload for `campaign.build.v1`
Example fields:
- `campaign_id`
- `template_id`: `collect_coins_v1`
- `difficulty`: `medium`
- `theme`: `neon_arcade`
- `assets`: `{ logo_uri, background_uri }`
- `audio`: `{ prompt, duration_sec }`
- `intro_video_uri` (placeholder)
- `outcome_win_uri` (placeholder)
- `outcome_lose_uri` (placeholder)
- `rules`: `{ win_score: 100, time_limit_sec: 45 }`

### 6.2 Expected artifacts after run
- `json/game_config`
- `audio/wav`
- `bundle/zip`
- `json/manifest`

### 6.3 Success criteria
- Run status = completed
- Manifest references correct URIs
- Steps have stored `input_hash` and can be cached

---

## 7) Concrete “Update audio” example (partial rebuild)

### Trigger update: `campaign.update_audio.v1`
Input:
- `base_run_id`
- `audio.prompt = "more energetic synthwave"`

Expected behavior:
- `generate_bgm_track` re-runs (new input_hash)
- `bundle_game_template` re-runs (audio uri changed)
- `assemble_campaign_manifest` re-runs (bundle uri changed)
- `game_config_from_template` is reused from cache (unchanged)

Success criteria:
- Only impacted steps executed
- Others marked skipped/reused

---

## 8) “Claude JSON Skill” Implementation Notes (MVP-safe)

### Output enforcement
- System prompt: “Return ONLY valid JSON. No markdown.”
- Include a compact JSON schema or a strict JSON example.
- Validate output.
- On failure: “Fix the JSON to match schema exactly. Return only JSON.”

### Minimal schema for `game_config.json`
Include:
- `template_id`
- `difficulty`
- `level_params` (numbers)
- `spawn_rates`
- `scoring`
- `controls`
- `assets` refs

Keep it tight so Claude reliably conforms.

---

## 9) Deliverables Checklist
Implement these deliverables to satisfy Spec 9:

1. YAML loaders:
- skills catalog (Spec 1)
- workflow registry (Spec 7)
- prompt registry (Spec 5)

2. Runner + validation (Spec 2)
- JSON schema validation for inputs/outputs

3. Providers thin wrapper (Spec 3)
- stub AudioProvider

4. Artifacts registry (minimal)
- register artifacts + compute content hash

5. Run engine (Spec 4)
- execute the minimal DAG
- store step statuses and reuse via cache

6. Three Skills:
- `assemble_campaign_manifest` (real)
- `generate_bgm_track` (stub provider)
- `game_config_from_template` (Claude JSON generation)

7. One runnable workflow:
- `campaign.build.v1` minimal slice
- plus `campaign.update_audio.v1` to validate partial rebuild

---

## 10) What to implement next after this slice
Once the Spec 9 slice works, expand incrementally:
- Replace placeholder video URIs with real skills:
  - `generate_intro_image` → `segment_start_button` → `generate_intro_video_loop`
  - `generate_outcome_video_win/lose`
- Replace stub bundler with real template bundler
- Add `review_asset_quality` gating (Claude critique)
