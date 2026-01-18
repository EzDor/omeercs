# Spec 2 — Skill Runner (NestJS) + Execution Model

## Goal
Implement a **SkillRunner** that can execute any registered Skill, validate inputs/outputs, register artifacts, and return a standard SkillResult.

## Modules (NestJS)
- `SkillCatalogModule`
  - Loads YAML descriptors
  - Validates required fields
  - Exposes `getSkill(skill_id, version?)`

- `SkillRunnerModule`
  - `SkillRunnerService.run(skill_id, input, ctx) -> SkillResult`
  - Validates input_schema
  - Executes implementation handler
  - Validates output_schema
  - Registers artifacts
  - Emits logs/metrics

- `ArtifactRegistryModule` (minimal for now)
  - `registerArtifact({type, uri, content_hash, metadata}) -> artifact_id`
  - Stores artifact metadata (DB or file-based stub in MVP)

## Skill execution types (MVP)
1) `ts_function` (default)
- Handler points to a TS module exporting `run(input, ctx)`
- Runs in-process (your preference)

2) `http_call` (optional)
- For calling a generation service you host or a provider wrapper service

3) `cli_command` (optional)
- For invoking an existing binary/script (keep minimal early)

## Execution Context (`ctx`)
- `run_id` (string)
- `step_name` (string)
- `workspace_dir` (string, temp directory)
- `artifact_base_uri` (string)
- `logger`
- `secrets` (provider API keys)
- `policy` (from skill descriptor)

## Validation Rules
- Input must pass JSON Schema.
- Output must pass JSON Schema.
- If skill uses Claude to generate config/code:
  - output must be **structured JSON** validated by schema
  - optional: lint/typecheck (only if generating TS; recommend avoid for MVP)

## Artifact Handling (MVP)
- Skill writes artifacts into `workspace_dir`
- Runner uploads/persists to object storage later (or local dev path now)
- Runner records:
  - `artifact_type`
  - `uri`
  - `content_hash` (best effort, e.g., sha256)
  - `metadata` (duration, resolution, provider, model)

## Error Handling
- Standardize exceptions:
  - `SkillInputValidationError`
  - `SkillExecutionError`
  - `SkillOutputValidationError`
  - `SkillPolicyViolationError`
- Return `ok:false` with structured error payload in `debug`

## Minimal Interfaces (TypeScript)
- `ISkillHandler.run(input, ctx): Promise<{ data, artifacts[] }>`
- `SkillRunnerService.run(skillId, input, ctx): Promise<SkillResult>`

## Deliverables (what you implement)
- YAML catalog loader + validator
- Runner with schema validation
- A sample skill end-to-end:
  - `generate_bgm_track` (stubbed provider call)
  - registers an `audio/wav` artifact
