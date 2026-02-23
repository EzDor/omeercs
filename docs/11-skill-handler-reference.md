# Skill Handler Reference

This document provides a detailed reference for every skill handler implementation in the agent platform. Each handler is a NestJS injectable service that implements the `SkillHandler<TInput, TOutput>` interface and is registered in the `SkillCatalogService` at startup.

## Handler Interface

Every handler implements this contract:

```typescript
interface SkillHandler<TInput, TOutput> {
  execute(input: TInput, context: SkillExecutionContext): Promise<SkillResult<TOutput>>;
}

interface SkillExecutionContext {
  executionId: string;
  tenantId: string;
  runId: string;
  stepName: string;
}

interface SkillResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  error_code?: string;
  artifacts?: SkillArtifact[];
  metadata?: {
    timings_ms?: Record<string, number>;
    provider_calls?: Array<{ provider: string; model: string; duration_ms: number }>;
  };
}
```

All handlers follow these patterns:
- **Never throw exceptions** — always return `skillSuccess()` or `skillFailure()` with structured error codes
- **Track timings** — every phase (prompt build, generation, save, parse) is timed in `timings_ms`
- **Produce artifacts** — generated files are registered as `SkillArtifact` objects with type, URI, and metadata
- **Support stub providers** — media handlers check `*_PROVIDER_STUB` env vars to return placeholder assets in development

---

## Handler Categories

| Category | Handlers | Purpose |
|----------|----------|---------|
| **Intelligence** | `CampaignPlanFromBriefHandler` | LLM-powered campaign planning |
| **Image** | `GenerateIntroImageHandler`, `SegmentStartButtonHandler`, `ExtractThemeFromImageHandler` | Image generation and analysis |
| **Video** | `GenerateIntroVideoLoopHandler`, `GenerateOutcomeVideoWinHandler`, `GenerateOutcomeVideoLoseHandler` | Video generation |
| **Audio** | `GenerateBgmTrackHandler`, `GenerateSfxPackHandler`, `MixAudioForGameHandler` | Audio generation and processing |
| **3D** | `Generate3DAssetHandler`, `Optimize3DAssetHandler` | 3D model generation and optimization |
| **Game** | `GenerateThreejsCodeHandler`, `BundleGameTemplateHandler`, `GameConfigFromTemplateHandler` | Game code generation and bundling |
| **Validation** | `ValidateBundleHandler`, `ValidateGameBundleHandler`, `ReviewAssetQualityHandler` | Quality assurance |
| **Assembly** | `AssembleCampaignManifestHandler` | Final campaign packaging |

---

## Intelligence Handlers

### CampaignPlanFromBriefHandler

**File**: `agent-platform/src/skills/handlers/campaign-plan-from-brief.handler.ts` (331 lines)

Generates a structured campaign plan from a marketing brief using LLM structured output.

**How it works**:
1. Builds a system prompt that instructs the LLM to act as a marketing campaign strategist
2. Constructs a user prompt from the brief text, constraints (excluded templates), and available templates
3. Calls LiteLLM with `response_format: { type: 'json_schema' }` to enforce structured JSON output
4. Parses the response into a `PlanOutput` containing: recommended template, theme colors, prize tiers, asset requirements, and engagement estimate
5. Validates required fields in the parsed output
6. On parse failure, retries with the error fed back to the LLM as context

**Key implementation details**:
- Uses `json_schema` response format with a strict schema definition for the plan output
- Retry loop (2 attempts by default) with parse error feedback to the LLM
- Tracks provider call tokens (input/output) for cost monitoring
- Returns the plan as an in-memory artifact (`memory://campaign-plan/{executionId}`)

---

## Image Handlers

### GenerateIntroImageHandler

**File**: `agent-platform/src/skills/handlers/generate-intro-image.handler.ts` (247 lines)

Generates an introductory campaign image using an external image generation provider.

**How it works**:
1. Resolves the appropriate image provider from the `ImageProviderRegistry` (Stability AI, NanoBanana, or Stub)
2. Builds a generation prompt from campaign theme, style parameters, and dimensions
3. Calls the provider's `generateImage()` method
4. Downloads the generated image from the returned URL (with SSRF protection)
5. Saves to the local filesystem under `SKILLS_OUTPUT_DIR/{executionId}/`
6. Returns the file URI and metadata (dimensions, format, file size)

**SSRF protection**:
- Uses `isAllowedUrl()` from `network-safety.utils` before downloading any URL
- Blocks localhost, private IPs (10.x, 172.16-31.x, 192.168.x), link-local (169.254.x), and cloud metadata endpoints
- Uses `fetchWithTimeout()` to prevent hanging on slow/malicious endpoints

**Stub mode**: When `IMAGE_PROVIDER_STUB=true`, uses the `StubImageAdapter` which returns a pre-generated placeholder image without calling any external API.

### SegmentStartButtonHandler

**File**: `agent-platform/src/skills/handlers/segment-start-button.handler.ts` (289 lines)

Uses a vision model to detect and locate start/play buttons in campaign images. This enables the system to overlay interactive elements precisely on generated imagery.

**How it works**:
1. Prepares the image for the vision model:
   - If the image is a URL, passes it directly
   - If it's a local file, reads it and converts to a base64 data URI
   - Validates local paths against `SKILLS_OUTPUT_DIR` to prevent path traversal
2. Sends the image to the vision model (default: `gemini-2.0-flash`) via `chatCompletion` with:
   - A system prompt describing the computer vision task
   - A `json_schema` response format enforcing the detection output structure
   - Temperature 0.1 for deterministic detection
3. Parses the response into bounding box coordinates, polygon mask points, button type, and confidence score
4. Applies confidence threshold filtering (default: 0.7)
5. Optionally generates a mask data file (polygon JSON) for button isolation

**Output schema** enforces:
- `detected` (boolean), `confidence` (0-1 float)
- `bounds` with `x, y, width, height` in pixels
- `mask_polygon` with `points` array and `is_closed` flag
- `button_type`: `play`, `start`, `cta`, or `unknown`

### ExtractThemeFromImageHandler

**File**: `agent-platform/src/skills/handlers/extract-theme-from-image.handler.ts` (211 lines)

Extracts a color theme from an uploaded image using pixel analysis (no LLM needed).

**How it works**:
1. Resolves the image path (supports `storage://` URIs) with path traversal protection
2. Uses `sharp` to resize the image to 100x100 pixels for fast processing
3. Extracts raw pixel data and bins colors into 32-value buckets
4. Sorts color buckets by frequency to find dominant colors
5. Sorts dominant colors by brightness (luminance formula: `0.299*R + 0.587*G + 0.114*B`)
6. Maps sorted colors to theme roles: primary, secondary, accent, background, text
7. Classifies mood based on HSL analysis of the primary color against a mood map:
   - Hue 0-30 + high saturation → `urgent`
   - Hue 30-70 → `playful`
   - Hue 70-160 → `natural`
   - Hue 160-260 → `professional`
   - Hue 260-320 → `premium`
   - Hue 320-360 → `festive`
   - Low saturation (<0.15) → `minimal`
8. Calculates confidence based on the number of distinct dominant colors found

**Fallback**: If the image file doesn't exist, returns a default theme with confidence 0.3.

---

## Video Handlers

### GenerateIntroVideoLoopHandler

**File**: `agent-platform/src/skills/handlers/generate-intro-video-loop.handler.ts` (318 lines)

Generates a seamless looping video from a source image for the campaign intro screen.

**How it works**:
1. Prepares the source image (URL or base64 encoding with path validation)
2. Builds a motion prompt describing the desired animation:
   - Motion types: `pan`, `zoom`, `rotate`, `parallax`, `subtle_movement`, `breathing`
   - Direction and intensity parameters
   - Seamless loop requirements
3. Calls the video generation API via LiteLLM with image-to-video parameters
4. Handles async generation: polls `waitForVideoGeneration()` if the initial response returns `pending` or `processing`
5. Downloads the generated video after validating the URL against `ALLOWED_VIDEO_DOMAINS`
6. Saves to `{SKILLS_OUTPUT_DIR}/{executionId}/intro-loop.{format}`

**Default specs**: 1920x1080, 30fps, 5 seconds, H.264 codec, MP4 format

**Stub mode**: When `VIDEO_PROVIDER_STUB=true`, creates a 1KB placeholder file. Throws an error if stub mode is enabled in production (`NODE_ENV=production`).

### GenerateOutcomeVideoWinHandler

**File**: `agent-platform/src/skills/handlers/generate-outcome-video-win.handler.ts` (330 lines)

Generates a celebratory win animation video.

**Prompt building**: Constructs a prompt emphasizing celebration, confetti, sparkles, and triumphant visuals. Uses mood descriptions from the theme (energetic, exciting, celebratory) and applies the campaign's primary color.

**Identical architecture** to `GenerateIntroVideoLoopHandler` with:
- Win-specific prompt construction (confetti, particle effects, celebration context)
- Win text overlay context (default: "Congratulations! You Win!")
- Background asset support (extracts background images from input assets)
- Output filename: `outcome-win.{format}`
- Artifact type: `video/outcome-win`

### GenerateOutcomeVideoLoseHandler

**File**: `agent-platform/src/skills/handlers/generate-outcome-video-lose.handler.ts` (325 lines)

Generates an encouraging "try again" animation video.

**Prompt building**: Explicitly maintains a positive, motivating atmosphere. Uses mood descriptions like "warm, comforting feeling" and "uplifting, positive message" instead of discouraging visuals.

**Identical architecture** to `GenerateOutcomeVideoWinHandler` with:
- Lose-specific prompt (encouraging tone, "try again" messaging)
- Lose text overlay context (default: "Better luck next time!")
- Output filename: `outcome-lose.{format}`
- Artifact type: `video/outcome-lose`

---

## Audio Handlers

### GenerateBgmTrackHandler

**File**: `agent-platform/src/skills/handlers/generate-bgm-track.handler.ts` (350 lines)

Generates a background music track for the campaign game.

**How it works**:
1. Builds a music prompt from style parameters:
   - Genre (e.g., electronic, orchestral)
   - Mood with descriptions: `happy` → "uplifting feel", `tense` → "building tension and suspense", `epic` → "cinematic grandeur"
   - Energy level: low (<0.3), medium (0.3-0.7), high (>0.7)
   - Instruments, BPM (default: 120), loop requirements
2. Calls the audio generation API via LiteLLM with all music parameters
3. Handles async generation: polls `waitForAudioGeneration()` with configurable timeout (default: 5 minutes)
4. Downloads the audio file with SSRF protection via `isAllowedUrl()` and `fetchWithTimeout()`
5. Saves as `bgm.{format}` (default: MP3, 44.1kHz, 192kbps, stereo)

**Stub mode**: Uses the `AudioProviderRegistry` to get a `stub` provider that generates actual silent WAV files with correct headers instead of calling external APIs.

### GenerateSfxPackHandler

**File**: `agent-platform/src/skills/handlers/generate-sfx-pack.handler.ts` (414 lines)

Generates a pack of sound effects for game interactions.

**How it works**:
1. Iterates over each `SfxRequest` in the input list
2. For each SFX, builds an intent-based prompt from a comprehensive library:
   - 22 built-in intents: `jump`, `coin`, `click`, `win`, `lose`, `collect`, `powerup`, `explosion`, `hit`, `miss`, `countdown`, `start`, `game_over`, `level_up`, `bonus`, `notification`, `error`, `success`, `whoosh`, `pop`, `ding`, `buzz`
   - `custom` intent with user-provided description
3. Applies style theme modifiers: `retro` → "8-bit retro game style", `sci_fi` → "sci-fi futuristic feel", etc.
4. Supports variation generation (multiple versions of the same SFX)
5. Validates download URLs against `ALLOWED_AUDIO_DOMAINS` allowlist
6. Generates an SFX manifest JSON file listing all generated files

**Domain allowlist**: `storage.googleapis.com`, `replicate.delivery`, `api.stability.ai`, `stability.ai`, `api.elevenlabs.io`

**Stub mode**: Generates actual silent WAV files with proper WAV headers (RIFF/WAVE format with correct byte offsets). Enforces that stub mode cannot be used in production.

**Filename sanitization**: Strips all characters except `[a-zA-Z0-9_-]` and limits to 100 characters.

### MixAudioForGameHandler

**File**: `agent-platform/src/skills/handlers/mix-audio-for-game.handler.ts` (316 lines)

Normalizes and mixes BGM and SFX audio files to consistent loudness levels using FFmpeg.

**How it works**:
1. Resolves loudness targets from presets or custom values:
   - `web_standard`: BGM -16 LUFS, SFX -14 LUFS, true peak -1 dBFS
   - `broadcast`: BGM -24 LUFS, SFX -20 LUFS, true peak -2 dBFS
   - `game_mobile`: BGM -14 LUFS, SFX -12 LUFS
   - `game_desktop`: BGM -16 LUFS, SFX -14 LUFS
2. For each audio file:
   - Analyzes current loudness using `ffprobe` and `ffmpeg`'s `loudnorm` filter
   - Normalizes using FFmpeg's `loudnorm` filter with target LUFS and true peak
   - Falls back to simple file copy if FFmpeg fails
3. Generates an audio manifest JSON documenting all normalized files with before/after loudness measurements

**External dependency**: Requires FFmpeg installed on the system (configurable via `FFMPEG_PATH` env var).

**SFX loading**: Supports both direct file references and manifest-based loading (reads an SFX pack manifest and resolves relative paths).

---

## 3D Handlers

### Generate3DAssetHandler

**File**: `agent-platform/src/skills/handlers/generate-3d-asset.handler.ts` (368 lines)

Generates 3D models using an external 3D generation service (default: Meshy v3).

**How it works**:
1. Builds a 3D generation prompt with:
   - 12 style options: `realistic`, `stylized`, `low_poly`, `cartoon`, `anime`, `voxel`, `hand_painted`, `sci_fi`, `fantasy`, `modern`, `retro`, `minimalist`
   - 12 category contexts: `character`, `prop`, `environment`, `vehicle`, `weapon`, `furniture`, `food`, `plant`, `animal`, `architecture`, `ui_element`, `other`
   - Color palette and material style preferences
2. Calls `model3DGeneration()` with polygon budget constraints (max triangles, max vertices, target platform)
3. Handles async generation with polling (timeout: 10 minutes)
4. Downloads and saves the model file (default: GLB format)
5. Separately downloads textures and LODs (Level of Detail) if provided by the service
6. Returns geometry metrics (triangle count, vertex count, materials) and bounding box dimensions

**Output formats**: GLB, GLTF, OBJ, FBX, USDZ

### Optimize3DAssetHandler

**File**: `agent-platform/src/skills/handlers/optimize-3d-asset.handler.ts` (390 lines)

Optimizes existing 3D models for target platforms (reducing polygon count, compressing textures, generating LODs).

**How it works**:
1. Validates the input model URI exists (local file or URL)
2. Determines optimization level: `balanced` (default), or custom constraints
3. Calls `model3DOptimization()` with:
   - Geometry constraints: max triangles, simplification ratio, preserve UV seams/hard edges
   - Texture constraints: max resolution, format, quality, compression, atlas packing
   - LOD generation: count, triangle count targets
   - Compression: Draco compression, meshopt compression
4. Downloads the optimized model and any generated LODs
5. Optionally preserves the original model (`keep_original` flag)
6. Calculates before/after metrics with reduction percentages for triangles, vertices, texture size, and file size

---

## Game Handlers

### GenerateThreejsCodeHandler

**File**: `agent-platform/src/skills/handlers/generate-threejs-code.handler.ts` (319 lines)

Generates Three.js game code using the Claude API (Anthropic SDK directly, not LiteLLM).

**How it works**:
1. Validates the template ID against an allowlist: `spin_wheel`, `quiz`, `scratch_card`, `memory_match`
2. Loads prompt files from the filesystem:
   - `threejs-system.prompt.txt` — system-level instructions for code generation
   - `{template_id}.prompt.txt` — template-specific instructions
   - Path traversal protection on prompt file loading
3. Builds a user prompt containing game config, asset mappings, scene overrides, and template manifest
4. Calls Claude directly via `@anthropic-ai/sdk` (not LiteLLM) with max 16K tokens
5. Parses `// FILE: filename.js` headers from the response to extract multiple code files
6. Validates each filename against a safe pattern: `/^[a-zA-Z0-9_-]+\.js$/`
7. Runs a **code safety scanner** checking for dangerous patterns:
   - `eval()`, `new Function()`, `require()`, dynamic `import()`
   - `process`, `__dirname`, `__filename`, `child_process`
   - `fs.`, `execSync`, `execFile`, `spawnSync`
8. On failure (empty output or safety violations), retries with the error description fed back to Claude
9. Writes validated code files to `{ASSET_STORAGE_DIR}/{executionId}/generated_code/`

**File purpose mapping**: Filenames map to purposes: `scene-setup.js` → `scene_setup`, `game-logic.js` → `game_logic`, `asset-loader.js` → `asset_loader`, etc.

**Retry**: Up to 3 attempts with exponential backoff (1s, 2s, 4s).

### BundleGameTemplateHandler

**File**: `agent-platform/src/skills/handlers/bundle-game-template.handler.ts` (606 lines)

Assembles a complete playable game bundle from generated code, templates, and assets.

**How it works**:
1. Validates the template ID against the templates directory (prevents path traversal)
2. Loads the template manifest via `TemplateManifestLoaderService`
3. Validates game config against the manifest's schema via `TemplateConfigValidatorService`
4. **Primary pipeline** (manifest-based):
   a. Calls `GenerateThreejsCodeHandler` to generate game code
   b. Writes generated code files to `scripts/` directory
   c. Writes Three.js and GSAP runtime placeholders to `lib/`
   d. Writes `game_config.json` (with sealed outcome token if present)
   e. Generates `index.html` with script tags (XSS-safe filename filtering and HTML escaping)
   f. Copies assets (images, audio, video, models) from URIs to the bundle
   g. Runs `ValidateBundleHandler` for headless browser validation
   h. Creates a `bundle_manifest.json` with SHA256 checksums for all files
5. **Legacy pipeline** (fallback): If manifest loading or code generation fails, falls back to copying static template files directly
6. Returns bundle URI, manifest URI, total size, file count, and optimization flags

**Asset handling**:
- Remote URLs: Validated via `isAllowedUrl()`, downloaded with `fetchWithTimeout()`
- Local files: Validated against `ASSET_STORAGE_DIR` and `SKILLS_OUTPUT_DIR`
- Audio directories: Recursively copies all files within

**Security**:
- Template ID cannot contain `..` or be an absolute path
- Script filenames in HTML are filtered through `/^[a-zA-Z0-9_-]+\.js$/`
- HTML title is escaped to prevent XSS
- Bundle checksum is a SHA256 hash of all individual file checksums concatenated

### GameConfigFromTemplateHandler

**File**: `agent-platform/src/skills/handlers/game-config-from-template.handler.ts` (280 lines)

Generates a complete `game_config.json` file for a game template using LLM structured output.

**How it works**:
1. Constructs a user prompt from template ID, theme, difficulty settings, color scheme, available assets, and copy text
2. Calls LiteLLM with a `json_schema` response format enforcing the game config structure
3. The schema requires: `template_id`, `version`, `settings` (duration, difficulty, locale), `visuals` (theme, colors), `audio` (BGM config), `mechanics` (template-specific), `copy` (title, instructions, win/lose messages)
4. Retries once on JSON parse failure with a 1-second delay
5. Returns the config as an in-memory artifact

**Template-specific mechanics**: The system prompt includes guidelines for each template type:
- `spin_wheel`: segments array with prizes, probabilities, colors
- `scratch_card`: grid size, reveal patterns, prize distribution
- `slot_machine`: reels configuration, symbol weights, paylines
- `memory_match`: grid dimensions, card themes, time limits
- `catch_game`: spawn rates, speeds, score values
- `quiz`: question count, time per question, scoring rules

---

## Validation Handlers

### ValidateBundleHandler

**File**: `agent-platform/src/skills/handlers/validate-bundle.handler.ts` (302 lines)

Validates a game bundle by loading it in a headless browser (Puppeteer) and running runtime checks.

**How it works**:
1. Calculates the bundle directory size (max 5MB recommended)
2. Starts a local HTTP static file server on a random port (with path traversal protection in the request handler)
3. Launches a headless Puppeteer browser with security flags (`--disable-extensions`, `--disable-background-networking`)
4. Navigates to `index.html` and runs these checks:
   - **html_loads**: HTTP response is 200 OK
   - **webgl_context_created**: A `<canvas>` element exists and WebGL context is available
   - **game_config_accessible**: `window.GAME_CONFIG` is defined
   - **no_uncaught_js_errors**: No console errors or page errors during a 3-second observation window
   - **game_ready_event**: The `gameReady` custom event fires within the timeout
5. Cleans up browser and server in a `finally` block

**Static server security**: The request handler resolves paths with `path.resolve()` and validates they start with the bundle directory, preventing path traversal attacks.

### ValidateGameBundleHandler

**File**: `agent-platform/src/skills/handlers/validate-game-bundle.handler.ts` (669 lines)

Comprehensive game bundle validation covering structure, manifest, config, assets, checksums, performance, compatibility, and security.

**Validation categories** (each independently toggleable):

| Check | What it validates |
|-------|-------------------|
| **Structure** | Required files exist (`index.html`, `game_config.json`, `bundle_manifest.json`), `index.html` references config |
| **Manifest** | JSON parseable, has `bundle_id`, `template_id`, `version`, `entry_point`, non-empty files list |
| **Config** | JSON parseable, has `template_id`, `settings`, `visuals` |
| **Assets** | All assets listed in manifest physically exist on disk |
| **Checksums** | SHA256 checksums of all files match manifest declarations |
| **Performance** | Total size under 50MB, no single file over 10MB, estimates 3G load time |
| **Compatibility** | Viewport meta tag for mobile, bundle size warnings for mobile (<10MB) |
| **Security** | Scans JS files for `eval()`, checks for inline scripts without CSP nonces |

**Issue severity levels**: `error` (blocks pass), `warning` (passes unless strict mode), `info` (informational)

**Strict mode**: When `strict_mode=true`, any warning also causes failure.

### ReviewAssetQualityHandler

**File**: `agent-platform/src/skills/handlers/review-asset-quality.handler.ts` (245 lines)

LLM-powered quality review of generated assets against configurable rubrics.

**Available rubrics**:
- `brand_consistency`: Logo usage, color palette, typography, visual style, messaging tone
- `technical_quality`: Resolution, file size, format, compression artifacts, color accuracy
- `accessibility`: Contrast ratios, text readability, alt text, motion considerations
- `performance`: Load time, memory usage, render performance, mobile optimization
- `general`: Overall appeal, professional quality, consistency, technical soundness

**How it works**:
1. Builds a review prompt with the rubric description, context (target platform, quality threshold, brand guidelines), and artifact references
2. Calls LiteLLM with a strict `json_schema` enforcing: pass/fail, overall score (0-100), per-artifact reviews with issues (severity + category + description) and suggested fixes (effort level, automatable flag)
3. Returns the structured review result as an in-memory artifact

---

## Assembly Handlers

### AssembleCampaignManifestHandler

**File**: `agent-platform/src/skills/handlers/assemble-campaign-manifest.handler.ts` (428 lines)

The final handler in the campaign build workflow. Assembles all generated artifacts into a complete campaign manifest and persists it.

**How it works**:
1. Collects outputs from all prior steps:
   - Campaign plan (template, theme, prizes)
   - Generated copy (headline, CTA, win/lose messages)
   - Game config and bundle
   - Media assets (intro image, intro video, outcome videos, BGM, SFX)
   - Quality review results
2. Validates that required assets are present (logs warnings for missing optional assets)
3. Assembles a comprehensive manifest containing:
   - Campaign metadata (ID, name, template)
   - Theme configuration (colors, fonts, mood)
   - Game configuration reference
   - Asset inventory with checksums and URIs
   - Copy text for all game states
   - Quality scores from the review
4. Writes the manifest to disk with SHA256 integrity checksum
5. Updates the campaign entity in the database via the `CampaignService`:
   - Sets status to `live`
   - Stores the manifest URI and metadata
   - Records the asset inventory for the frontend

**Path traversal protection**: All file paths are validated against allowed directories before writing.

**Checksum**: The manifest itself gets a SHA256 checksum of its JSON content for integrity verification.

---

## Shared Utilities

### Network Safety (`network-safety.utils.ts`)

All handlers that download files from external URLs use these shared utilities:

**`isAllowedUrl(url)`**: Returns `false` for:
- Non-HTTP(S) protocols
- `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`
- `169.254.169.254` (cloud metadata endpoint)
- `metadata.google.internal`
- Private IPv4 ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`
- Private IPv6: `::1`, `fc00::/7`, `fe80::/10`

**`fetchWithTimeout(url, timeoutMs)`**: Wraps `fetch()` with an `AbortController` timeout (default: 30 seconds).

### Domain Allowlists

Several handlers maintain their own domain allowlists for downloaded media:

| Handler | Allowed Domains |
|---------|----------------|
| **Video handlers** | `runway-cdn.com`, `storage.googleapis.com`, `replicate.delivery`, `api.stability.ai`, `stability.ai` |
| **SFX handler** | `storage.googleapis.com`, `replicate.delivery`, `api.stability.ai`, `stability.ai`, `api.elevenlabs.io` |
| **Image/BGM handlers** | Use `isAllowedUrl()` (blocks private IPs, no allowlist) |

### Path Traversal Protection

Every handler that reads or writes files validates paths against allowed directories:

```
Pattern: path.resolve(candidatePath).startsWith(path.resolve(allowedDir) + path.sep)
```

Allowed directories are typically `ASSET_STORAGE_DIR` and `SKILLS_OUTPUT_DIR`.

---

## Execution Patterns Summary

### Standard Handler Lifecycle

```
1. Log entry with tenant/execution context
2. Check for stub provider mode
3. Build prompt/parameters
4. Call external service (LLM, media provider)
5. Handle async polling if needed
6. Validate response URL/content
7. Download and save artifact
8. Return skillSuccess(output, artifacts, metadata)
   — or —
   Return skillFailure(message, code, metadata)
```

### Stub Provider Pattern

All media handlers (image, video, audio) follow this pattern for development/testing:

```typescript
constructor(configService: ConfigService) {
  this.useStubProvider = configService.get<string>('VIDEO_PROVIDER_STUB') === 'true';
  if (this.useStubProvider && configService.get<string>('NODE_ENV') === 'production') {
    throw new Error('Stub video provider must not be used in production');
  }
}

async execute(input, context) {
  if (this.useStubProvider) {
    return this.executeStub(input, context, startTime, timings);
  }
  // ... real implementation
}
```

Stub implementations:
- **Image**: Returns a pre-generated placeholder PNG
- **Video**: Creates a 1KB buffer file
- **Audio (BGM)**: Uses `AudioProviderRegistry.getProvider('stub')`
- **Audio (SFX)**: Generates valid WAV files with proper RIFF headers and silent audio data

### Retry Patterns

| Handler | Max Attempts | Backoff | Feedback |
|---------|-------------|---------|----------|
| `GenerateThreejsCodeHandler` | 3 | Exponential (1s, 2s, 4s) | Error message fed back to Claude |
| `CampaignPlanFromBriefHandler` | 2 | 1s fixed delay | Parse error fed back to LLM |
| `GameConfigFromTemplateHandler` | 2 | 1s fixed delay | None (simple retry) |
| `LlmGenerationService` (template skills) | 3 | Exponential | Validation critique fed back |

### Timing Tracking

Every handler tracks detailed timings:

```typescript
const timings: Record<string, number> = {};
const promptStart = Date.now();
// ... build prompt
timings['prompt_build'] = Date.now() - promptStart;

const genStart = Date.now();
// ... call provider
timings['generation'] = Date.now() - genStart;

// Final return includes all timings
return skillSuccess(output, artifacts, {
  timings_ms: { total: Date.now() - startTime, ...timings }
});
```

Common timing keys: `prompt_build`, `generation`, `save`, `parse`, `validate`, `copy_assets`, `setup`.
