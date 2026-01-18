# Spec 5 — Prompt & Config Registry (Templates + Rubrics)

## Goal
Centralize prompt templates, config templates, and review rubrics so Skills can reuse them consistently.
This enables fast iteration without scattering prompts across code.

---

## What is stored

### PromptTemplate
- `prompt_id` (string)
- `version` (semver)
- `description`
- `template` (string with variables, e.g. `{{brand_name}}`)
- `vars_schema` (JSON Schema for variables)
- `model_defaults` (optional): preferred model, temperature, max tokens
- `output_schema` (optional): JSON Schema if prompt expects structured output

### ConfigTemplate
- `config_id`, `version`
- `template_json` (or file path)
- `vars_schema`

### ReviewRubric
- `rubric_id`, `version`
- `criteria[]` (each: name, description, scoring guidance)
- `output_schema` (structured critique result)

---

## Storage (MVP)
Repo-based, versioned in git:
- `/prompts/<prompt_id>/<version>.md`
- `/configs/<config_id>/<version>.json`
- `/rubrics/<rubric_id>/<version>.json`
- `/registry/index.yaml` (optional index)

`PromptRegistryService` loads and validates at startup.

---

## Runtime API

### PromptRegistryService
- `getPrompt(prompt_id, version?)`
- `renderPrompt(prompt_id, version, vars) -> resolved_prompt`
- `getRubric(rubric_id, version?)`

### Recording resolved prompts
For each run step that uses an LLM:
- store `resolved_prompt` (or hash + vars) inside `run_steps.debug`
- store `model_used`, parameters, and any provider metadata

---

## How Skills use the registry
- `campaign_plan_from_brief`: loads `prompt.campaign_plan.v1` and expects JSON output (schema validated)
- `game_config_from_template`: loads `prompt.game_config.v1` and expects JSON output (schema validated)
- `review_asset_quality`: loads rubric and expects structured critique output

---

## Deliverables
- Registry folder structure in repo
- Loader + validator service
- Simple renderer (mustache/handlebars)
- Example prompts + rubric v1
