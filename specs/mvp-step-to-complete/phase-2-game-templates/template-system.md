# Game Template System

## Purpose
Provide a framework for creating, managing, and rendering Three.js WebGL 3D game templates. Templates are pre-built 3D game shells that accept dynamic configuration (theme, prizes, 3D assets, scene parameters) and produce playable campaign games. Game code is generated dynamically by the Claude Agent SDK, which reads the template specification and assembles a complete Three.js application bundled with all required assets.

## User Stories

### P1 (Critical)
- US1: As a skill handler (bundle_game_template), I want to invoke Claude Agent SDK with a template spec and game config so that it generates a complete Three.js game bundle
- US2: As a template developer, I want a clear interface for defining 3D scene requirements, asset slots, and config schemas so that I can add game types without modifying core code
- US3: As the campaign player, I want templates to render performant 3D scenes on both desktop and mobile devices

### P2 (Important)
- US4: As a skill handler, I want to inject 3D assets (models, textures, environment maps, audio, video) into asset slots so that campaigns use branded and AI-generated content
- US5: As a template developer, I want hot-reload during development so that I can iterate on 3D scenes quickly
- US6: As the system, I want template versioning so that existing campaigns continue working when templates are updated

### P3 (Nice to Have)
- US7: As an operator, I want template analytics (WebGL render time, frame rate, interaction rate) so that I can optimize 3D performance
- US8: As a designer, I want scene-level theming (lighting colors, material properties, post-processing) so that brand identity can be applied without code changes

## Requirements

### Template Architecture
- REQ1: Templates define Three.js WebGL 3D scene specifications that Claude Agent SDK uses to generate runnable game code
- REQ2: Each template has a manifest file defining: id, version, config schema, asset slots (including 3D model and texture slots), and scene configuration
- REQ3: Generated bundles must work offline after initial load (no external dependencies at runtime)
- REQ4: Generated bundles must be < 5MB uncompressed (Three.js runtime + 3D assets + generated code)

### Config Injection
- REQ5: Game config injected via `window.GAME_CONFIG` global before template JS executes
- REQ6: Config schema defined per template using JSON Schema, including Three.js scene parameters
- REQ7: Config validation at bundle time (fail fast if config doesn't match schema)

### Asset Slots
- REQ8: Templates define named asset slots: `background_image`, `logo`, `bgm_track`, `win_sound`, `scene_model`, `branded_model`, `environment_map`, `diffuse_texture`, `normal_texture`, etc.
- REQ9: 3D model assets support GLB and GLTF formats; textures support PNG, JPEG, and HDR/EXR for environment maps
- REQ10: Assets injected by copying files to their respective directories (`models/`, `textures/`, `assets/`) in the generated bundle
- REQ11: Asset manifest generated listing all injected assets with paths and types

### 3D Rendering
- REQ12: All templates use Three.js (r170+) as the core rendering engine via WebGL2 with WebGL1 fallback
- REQ13: Templates must support viewports from 320px to 1920px width with automatic renderer resize
- REQ14: Scene configuration includes camera type/position, lighting setup, and optional post-processing pipeline
- REQ15: Touch-first interaction with pointer events and mouse fallback for 3D scene manipulation
- REQ16: Safe area handling for mobile notches/buttons with renderer viewport adjustment

### Template Manifest Schema
```yaml
template_id: spin_wheel
version: "1.0.0"
title: "Spin the Wheel"
description: "3D prize wheel game with configurable segments and physics-based spin"

config_schema:
  type: object
  properties:
    wheel_segments: { type: array, items: { type: object } }
    spin_duration_ms: { type: number, default: 5000 }
    theme: { $ref: "#/definitions/theme" }
  required: [wheel_segments]

scene_config:
  camera:
    type: perspective
    fov: 60
    position: [0, 2, 5]
    look_at: [0, 0, 0]
  lighting:
    ambient: { color: "#ffffff", intensity: 0.4 }
    directional:
      - { color: "#ffffff", intensity: 0.8, position: [5, 10, 5], cast_shadow: true }
    point_lights: []
  environment:
    background_type: color
    background_color: "#1a1a2e"
    environment_map_slot: environment_map
  post_processing:
    bloom: { enabled: true, strength: 0.5, threshold: 0.8 }
    anti_alias: true

asset_slots:
  - slot_id: background_image
    type: image
    required: false
    default: "textures/default_bg.png"
  - slot_id: scene_model
    type: model_3d
    format: [glb, gltf]
    required: false
    description: "Main 3D scene environment model"
  - slot_id: branded_model
    type: model_3d
    format: [glb, gltf]
    required: false
    description: "Branded 3D object (e.g., logo, product)"
  - slot_id: environment_map
    type: environment_map
    format: [hdr, exr]
    required: false
    description: "HDR environment map for reflections and IBL"
  - slot_id: diffuse_texture
    type: texture
    format: [png, jpg]
    required: false
    description: "Diffuse/albedo texture for branded materials"
  - slot_id: normal_texture
    type: texture
    format: [png, jpg]
    required: false
    description: "Normal map texture for surface detail"
  - slot_id: bgm_track
    type: audio
    required: false
  - slot_id: win_sound
    type: audio
    required: true

entry_point: index.html
```

## Template Directory Structure
```
templates/games/
├── spin_wheel/
│   ├── manifest.yaml
│   ├── template.spec.yaml
│   ├── scenes/
│   │   └── main-scene.yaml
│   ├── models/
│   │   ├── wheel.glb
│   │   └── pointer.glb
│   ├── textures/
│   │   ├── default_bg.png
│   │   └── wheel_segment.png
│   ├── shaders/
│   │   └── glow.glsl
│   └── assets/
│       └── sounds/
├── scratch_card/
│   ├── manifest.yaml
│   ├── template.spec.yaml
│   ├── scenes/
│   ├── models/
│   ├── textures/
│   └── shaders/
├── quiz/
│   └── ...
└── memory_match/
    └── ...
```

## Code Generation Pipeline

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) powers the dynamic generation of Three.js game code for each campaign bundle.

### Pipeline Stages

**Stage 1 - Input Assembly**
Collect all inputs required for generation: the template specification (`manifest.yaml` + `template.spec.yaml`), the game configuration provided by the campaign workflow, and URIs for all brand/AI-generated assets (3D models, textures, audio, images).

**Stage 2 - Agent Generation**
Invoke the Claude Agent SDK with the assembled inputs. The agent reads the template specification, interprets the scene configuration (camera, lighting, post-processing), and generates a complete Three.js application. The generated code includes scene setup, asset loading (GLTFLoader for 3D models, TextureLoader for textures, AudioLoader for audio), game logic, animation loops, responsive viewport handling, and user interaction handlers.

**Stage 3 - Asset Integration**
The agent resolves all asset slot references, downloads assets from their source URIs, and places them into the correct bundle directories (`models/`, `textures/`, `assets/`). It generates the asset manifest mapping slot IDs to their bundled file paths.

**Stage 4 - Bundle Assembly**
The agent assembles the final deployable package: an `index.html` entry point that loads Three.js and the generated game script, all 3D models and textures in their respective directories, and the injected `window.GAME_CONFIG`. The bundle is self-contained with no external runtime dependencies.

### Generation Inputs
```typescript
interface CodeGenerationInput {
  template_spec: TemplateManifest;
  scene_definitions: SceneDefinition[];
  game_config: GameConfig;
  asset_mappings: AssetMapping[];
  target_threejs_version: string;
}
```

### Generation Output
```typescript
interface CodeGenerationOutput {
  entry_html: string;
  generated_scripts: GeneratedScript[];
  asset_manifest: AssetManifestEntry[];
  bundle_metadata: {
    threejs_version: string;
    total_size_bytes: number;
    model_count: number;
    texture_count: number;
  };
}

interface GeneratedScript {
  filename: string;
  content: string;
  purpose: 'scene_setup' | 'game_logic' | 'asset_loader' | 'interaction' | 'animation';
}
```

## Integration with bundle_game_template Skill

```typescript
interface BundleGameTemplateInput {
  template_id: string;
  game_config: GameConfig;
  assets: AssetMapping[];
  scene_overrides?: SceneOverrides;
}

interface AssetMapping {
  slot: string;
  uri: string;
  type: 'image' | 'audio' | 'video' | 'model_3d' | 'texture' | 'environment_map';
  format?: string;
}

interface SceneOverrides {
  camera_position?: [number, number, number];
  lighting_intensity?: number;
  background_color?: string;
  post_processing?: PostProcessingConfig;
}
```

The `bundle_game_template` skill handler invokes the Claude Agent SDK code generation pipeline. It loads the template manifest, merges the provided game config and scene overrides, resolves all asset URIs from the asset mappings, and passes the complete input to the agent. The agent generates the Three.js application code and the handler assembles the final bundle, validates it against the template's config schema, and uploads it to asset storage.

## Dependencies
- **Three.js** (r170+): Core 3D rendering engine included in all generated bundles
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`): AI agent for dynamic Three.js code generation at bundle time
- **Asset Storage**: For loading/storing 3D models, textures, and other injected assets
- **3D Asset Pipeline**: GLB/GLTF model support, HDR environment map processing, texture optimization
- Required by: bundle_game_template skill, Campaign Preview Player

## Success Criteria
- [ ] Claude Agent SDK generates valid, runnable Three.js code from template specifications
- [ ] Generated 3D scenes render correctly on desktop Chrome, Safari, Firefox (WebGL2)
- [ ] Generated 3D scenes render correctly on mobile iOS Safari, Android Chrome (WebGL2 with WebGL1 fallback)
- [ ] Config injection works and 3D scene behavior changes based on config (segments, lighting, materials)
- [ ] 3D model asset slots (GLB/GLTF) load and render correctly in the generated scene
- [ ] Texture and environment map slots apply correctly to 3D materials
- [ ] Generated bundles maintain 30fps minimum on mid-range mobile devices
- [ ] Generated bundles stay under 5MB uncompressed
- [ ] Template manifests validate against schema including 3D scene configuration
- [ ] Version upgrades don't break existing bundles
- [ ] WebGL context loss is handled gracefully with automatic recovery
