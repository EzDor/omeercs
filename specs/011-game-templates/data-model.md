# Data Model: Game Template System

**Feature**: 011-game-templates
**Date**: 2026-02-13

## Entities

### 1. Template Manifest (System-Level, Filesystem)

Not a database entity - stored as YAML files in `templates/games/{template_id}/manifest.yaml`. Loaded and cached in-memory by `TemplateManifestLoaderService`.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| template_id | string | Yes | Unique identifier (e.g., `spin_wheel`, `quiz`) |
| version | string (semver) | Yes | Template version (e.g., `1.0.0`) |
| title | string | Yes | Human-readable name |
| description | string | Yes | Template description for prompts and UI |
| config_schema | JSONSchema | Yes | JSON Schema defining valid game configurations |
| asset_slots | AssetSlot[] | Yes | Named asset placeholders with type constraints |
| scene_config | SceneConfig | Yes | Default camera, lighting, environment, post-processing |
| entry_point | string | Yes | Bundle entry file (e.g., `index.html`) |

**Relationships**: Referenced by `BundleGameTemplateInput.template_id`. No database relationships.

**Lifecycle**: Static configuration. Updated by developers via code commits. Versioned via `version` field for backward compatibility.

---

### 2. Asset Slot (Embedded in Template Manifest)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| slot_id | string | Yes | Unique within template (e.g., `wheel_model`, `win_sound`) |
| type | enum | Yes | `image`, `audio`, `model_3d`, `texture`, `environment_map` |
| formats | string[] | No | Allowed file formats (e.g., `[glb, gltf]`, `[png, jpg]`) |
| required | boolean | Yes | Whether asset must be provided for bundle generation |
| default | string | No | Path to default asset within template directory |
| description | string | No | Slot purpose for documentation and prompt context |
| max_size_bytes | number | No | Maximum file size for this slot |

---

### 3. Scene Config (Embedded in Template Manifest)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| camera | CameraConfig | Yes | Camera type, FOV, position, look_at |
| lighting | LightingConfig | Yes | Ambient, directional, point, spot light definitions |
| environment | EnvironmentConfig | No | Background type, color, environment map slot reference |
| post_processing | PostProcessingConfig | No | Bloom, DOF, FXAA, color grading settings |

**CameraConfig**:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| type | `perspective` \| `orthographic` | `perspective` | Camera type |
| fov | number | 60 | Field of view (perspective only) |
| position | [number, number, number] | [0, 2, 5] | Camera world position |
| look_at | [number, number, number] | [0, 0, 0] | Camera target |

**LightingConfig**:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| ambient | { color: string, intensity: number } | { color: "#ffffff", intensity: 0.4 } | Ambient light |
| directional | DirectionalLight[] | [] | Directional lights with shadow support |
| point_lights | PointLight[] | [] | Point lights for local illumination |
| spot_lights | SpotLight[] | [] | Spot lights for focused illumination |

**PostProcessingConfig**:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| bloom | { enabled: boolean, strength: number, threshold: number } | disabled | Bloom/glow effect |
| dof | { enabled: boolean, focus: number, aperture: number } | disabled | Depth of field |
| fxaa | { enabled: boolean } | enabled | Anti-aliasing |

---

### 4. Artifact Entity (Existing - No Changes)

Already exists at `dao/src/entities/artifact.entity.ts`. Used to store generated bundle artifacts.

**Relevant artifact types for this feature**:
- `bundle/game` - Complete game bundle directory
- `code/javascript` - Generated Three.js code files
- `json/bundle-manifest` - Bundle manifest with checksums

---

### 5. Run / RunStep Entities (Existing - No Changes)

Already exist. New workflow steps (`generate_code`, `validate_bundle`) create `RunStep` records automatically via the existing run engine.

---

## TypeScript Interfaces

### TemplateManifest

```typescript
interface TemplateManifest {
  template_id: string;
  version: string;
  title: string;
  description: string;
  config_schema: Record<string, unknown>;
  asset_slots: AssetSlotDefinition[];
  scene_config: SceneConfig;
  entry_point: string;
}

interface AssetSlotDefinition {
  slot_id: string;
  type: 'image' | 'audio' | 'model_3d' | 'texture' | 'environment_map';
  formats?: string[];
  required: boolean;
  default?: string;
  description?: string;
  max_size_bytes?: number;
}
```

### Code Generation Input/Output

```typescript
interface GenerateThreejsCodeInput {
  template_id: string;
  template_manifest: TemplateManifest;
  game_config: Record<string, unknown>;
  asset_mappings: AssetMapping[];
  scene_overrides?: SceneOverrides;
  sealed_outcome_token?: string;
}

interface GenerateThreejsCodeOutput {
  code_files: CodeFile[];
  code_dir: string;
  total_lines: number;
}

interface CodeFile {
  filename: string;
  purpose: 'scene_setup' | 'game_logic' | 'asset_loader' | 'interaction' | 'animation' | 'entry';
  content: string;
  line_count: number;
}
```

### Bundle Validation Input/Output

```typescript
interface ValidateBundleInput {
  bundle_dir: string;
  entry_point: string;
  timeout_ms?: number;
}

interface ValidateBundleOutput {
  valid: boolean;
  checks: ValidationCheck[];
  total_size_bytes: number;
  load_time_ms: number;
  errors: string[];
}

interface ValidationCheck {
  name: string;
  passed: boolean;
  details?: string;
}
```

### Game Complete Event (Client → Server)

```typescript
interface GameCompleteEvent {
  event_type: 'gameComplete';
  template_id: string;
  sealed_outcome_token: string;
  player_result: PlayerResult;
  duration_ms: number;
  timestamp: string;
}

type PlayerResult =
  | SpinWheelResult
  | QuizResult
  | ScratchCardResult
  | MemoryMatchResult;

interface SpinWheelResult {
  type: 'spin_wheel';
  landed_segment_index: number;
}

interface QuizResult {
  type: 'quiz';
  answers: { question_index: number; selected_answer_index: number }[];
  score: number;
  total_questions: number;
}

interface ScratchCardResult {
  type: 'scratch_card';
  percent_scratched: number;
}

interface MemoryMatchResult {
  type: 'memory_match';
  moves: number;
  time_ms: number;
  pairs_matched: number;
  total_pairs: number;
}
```

## Data Flow

```
Campaign Workflow
    │
    ▼
┌─────────────────────┐    template_id     ┌──────────────────────┐
│ game_config step     │──────────────────► │ TemplateManifestLoader│
│ (generates config)   │                    │ (loads manifest.yaml) │
└─────────────────────┘                    └──────────────────────┘
    │                                              │
    │ game_config                                  │ manifest
    ▼                                              ▼
┌─────────────────────┐                    ┌──────────────────────┐
│ ConfigValidator      │◄──────────────────│ Ajv (JSON Schema)    │
│ (validates config)   │                    │                      │
└─────────────────────┘                    └──────────────────────┘
    │
    │ validated config + manifest
    ▼
┌─────────────────────┐   Claude SDK      ┌──────────────────────┐
│ generate_threejs_code│──────────────────►│ Claude Opus 4.6      │
│ (skill handler)      │◄──────────────────│ (generates Three.js) │
└─────────────────────┘                    └──────────────────────┘
    │
    │ code files
    ▼
┌─────────────────────┐                    ┌──────────────────────┐
│ bundle_game_template │──────────────────►│ StorageService       │
│ (assembles bundle)   │                    │ (stores artifacts)   │
└─────────────────────┘                    └──────────────────────┘
    │
    │ bundle directory
    ▼
┌─────────────────────┐   Puppeteer       ┌──────────────────────┐
│ validate_bundle      │──────────────────►│ Headless Chrome      │
│ (skill handler)      │◄──────────────────│ (WebGL validation)   │
└─────────────────────┘                    └──────────────────────┘
    │
    │ validation result
    ▼
  Bundle stored as artifact (or rejected)
```
