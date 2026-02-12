# Game Template System

## Purpose
Provide a framework for creating, managing, and rendering HTML5 game templates. Templates are pre-built game shells that accept dynamic configuration (theme, prizes, assets) and produce playable campaign games.

## User Stories

### P1 (Critical)
- US1: As a skill handler (bundle_game_template), I want to inject game configuration into a template so that each campaign has unique settings
- US2: As a template developer, I want a clear interface for creating new templates so that I can add game types without modifying core code
- US3: As the campaign player, I want templates to be mobile-responsive so that games work on all devices

### P2 (Important)
- US4: As a skill handler, I want to inject media assets (images, audio, video) into asset slots so that campaigns use AI-generated content
- US5: As a template developer, I want hot-reload during development so that I can iterate quickly
- US6: As the system, I want template versioning so that existing campaigns continue working when templates are updated

### P3 (Nice to Have)
- US7: As an operator, I want template analytics (load time, interaction rate) so that I can optimize performance
- US8: As a designer, I want CSS variable theming so that brand colors can be applied without code changes

## Requirements

### Template Architecture
- REQ1: Templates are self-contained HTML5 apps (HTML + CSS + JS bundled)
- REQ2: Each template has a manifest file defining: id, version, config schema, asset slots
- REQ3: Templates must work offline after initial load (no external dependencies at runtime)
- REQ4: Templates must be < 500KB uncompressed (excluding injected assets)

### Config Injection
- REQ5: Game config injected via `window.GAME_CONFIG` global before template JS executes
- REQ6: Config schema defined per template using JSON Schema
- REQ7: Config validation at bundle time (fail fast if config doesn't match schema)

### Asset Slots
- REQ8: Templates define named asset slots: `background_image`, `logo`, `bgm_track`, `win_sound`, etc.
- REQ9: Assets injected by copying files to `assets/` directory in bundle
- REQ10: Asset manifest generated listing all injected assets with paths

### Responsive Design
- REQ11: Templates must support viewports: 320px - 1920px width
- REQ12: Safe area handling for mobile notches/buttons
- REQ13: Touch-first interaction with mouse fallback

### Template Manifest Schema
```yaml
template_id: spin_wheel
version: "1.0.0"
title: "Spin the Wheel"
description: "Prize wheel game with configurable segments"

config_schema:
  type: object
  properties:
    wheel_segments: { type: array, items: { type: object } }
    spin_duration_ms: { type: number, default: 5000 }
    theme: { $ref: "#/definitions/theme" }
  required: [wheel_segments]

asset_slots:
  - slot_id: background_image
    type: image
    required: false
    default: "default_bg.png"
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
│   ├── index.html
│   ├── styles.css
│   ├── game.js
│   └── assets/
│       ├── default_bg.png
│       └── sounds/
├── scratch_card/
│   └── ...
├── quiz/
│   └── ...
└── memory_match/
    └── ...
```

## Dependencies
- Depends on: Asset Storage (for loading injected assets)
- Required by: bundle_game_template skill, Campaign Preview Player

## Integration with bundle_game_template Skill
```typescript
// Existing handler at:
// agent-platform/src/skills/handlers/bundle-game-template.handler.ts

interface BundleGameTemplateInput {
  template_id: string;           // e.g., "spin_wheel"
  game_config: GameConfig;       // Template-specific config
  assets: AssetMapping[];        // Assets to inject into slots
}

interface AssetMapping {
  slot: string;                  // Asset slot ID from manifest
  uri: string;                   // S3/CDN URL or local path
  type: 'image' | 'audio' | 'video';
}
```

## Success Criteria
- [ ] Templates render correctly on desktop Chrome, Safari, Firefox
- [ ] Templates render correctly on mobile iOS Safari, Android Chrome
- [ ] Config injection works and game behavior changes based on config
- [ ] Asset slots accept external URLs and bundle them correctly
- [ ] Templates pass Lighthouse performance audit (score > 80)
- [ ] Template manifests validate against schema
- [ ] Version upgrades don't break existing bundles
