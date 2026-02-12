# Asset Provider - 3D Models & Images

## Purpose
Provide AI-generated branded 3D assets (models, textures) and 2D images for campaigns. Since all game templates now use Three.js for 3D rendering, 3D model generation is the primary focus. The system uses a 3D asset generation API (such as Meshy AI) for GLB/GLTF model generation and Nano Banana Pro (Google Gemini 3 Pro Image) for 2D image and texture generation.

## User Stories

### P1 (Critical)
- US1: As the generate_3d_asset skill, I want to generate branded 3D models (wheel, cards, stage, logo) from text/image prompts so that Three.js game scenes use unique, campaign-specific assets
- US2: As a skill handler, I want generated 3D models in GLB format with PBR materials so that they render correctly in Three.js with metalness, roughness, and normal maps
- US3: As the system, I want proper error handling for long-running 3D generation jobs so that workflows can retry or fail gracefully

### P2 (Important)
- US4: As a skill handler, I want to generate 2D textures (diffuse maps, normal maps, environment textures) from text prompts so that 3D materials look professional
- US5: As an operator, I want to track API costs per generation so that I can monitor spend and bill tenants
- US6: As a skill handler, I want models optimized for real-time rendering (low poly count, efficient UV layout) so that games run at 60fps on mobile

### P3 (Nice to Have)
- US7: As a skill handler, I want image-to-3D generation so that I can create 3D models from brand logos or product photos
- US8: As a developer, I want to generate HDRI environment maps so that Three.js scenes have realistic reflections and lighting

## Requirements

### 3D Model Generation (Primary)
- REQ1: Text-to-3D model generation with descriptive prompts (e.g., "branded prize wheel with metallic gold segments")
- REQ2: Image-to-3D model generation from reference images (brand logo -> 3D logo model)
- REQ3: Output format: GLB (primary), with GLTF as alternative
- REQ4: Generated models include PBR materials (metalness, roughness, normal maps, base color)
- REQ5: Models optimized for real-time Three.js rendering (< 50k triangles per model)
- REQ6: Support art styles: realistic, stylized, low-poly, cartoon
- REQ7: Support topology targets: quad-dominant for clean geometry

### 2D Image & Texture Generation
- REQ8: Text-to-image for textures, backgrounds, and UI assets via Nano Banana Pro
- REQ9: Support resolutions: 512x512, 1024x1024, 2048x2048, 4096x4096 for textures
- REQ10: Support generation of seamless/tiling textures for 3D materials
- REQ11: Support style presets: photographic, digital-art, anime, brand-consistent
- REQ12: Generate HDRI environment maps for Three.js scene lighting and reflections

### Technical
- REQ13: Use 3D asset API (Meshy AI as reference implementation) for model generation
- REQ14: Use Nano Banana Pro API for 2D image/texture generation
- REQ15: Implement provider adapter pattern matching existing provider-adapters spec
- REQ16: Handle async generation with polling (3D models: check every 10s, timeout 600s; images: check every 2s, timeout 60s)
- REQ17: Download and re-upload to S3 for permanent storage
- REQ18: Store generation metadata in debug output (model polycount, texture resolution, generation parameters)

### Rate Limiting & Costs
- REQ19: Implement request queue (3D: max 2 concurrent per tenant; 2D: max 5 concurrent)
- REQ20: Track cost per request based on model complexity and texture resolution
- REQ21: Log cost data to run_steps.debug for billing analysis

## API Integration

### 3D Model Generation API (Meshy AI)
```
1. POST /v2/text-to-3d
   - Body: {
       prompt,
       art_style: 'realistic' | 'stylized' | 'low-poly',
       topology: 'quad' | 'triangle',
       target_polycount: 50000
     }
   - Response: { result: task_id }

2. GET /v2/text-to-3d/{task_id}
   - Poll until status: 'SUCCEEDED'
   - Response: {
       status,
       model_urls: { glb, fbx, obj },
       texture_urls: { base_color, metallic, roughness, normal },
       polycount,
       credits_used
     }

3. Download GLB model file
```

### Image-to-3D API
```
1. POST /v2/image-to-3d
   - Body: { image (base64), topology, target_polycount }
   - Response: { result: task_id }

2. Same polling as text-to-3d
```

### 2D Image/Texture Generation (Nano Banana Pro)
```
1. POST /v1/images/generate
   - Body: {
       prompt,
       resolution: '1024x1024',
       style: 'photographic' | 'digital-art',
       tiling: boolean
     }
   - Response: { image_url | image_base64 }
```

### Response Handling
- Success (3D): Return `{ model_url, texture_urls, polycount, format, credits_used }`
- Success (2D): Return `{ image_url, resolution, format }`
- Failure: Map API error codes to skill error codes
  - 400: INPUT_VALIDATION_ERROR
  - 401/403: PROVIDER_AUTH_ERROR
  - 429: RATE_LIMIT_ERROR
  - 500+: PROVIDER_ERROR

## Use Cases for 3D Assets
| Game Template | 3D Assets Needed |
|--------------|------------------|
| Spin Wheel | wheel model, pointer model, branded logo model |
| Memory Match | card model, table model, brand logo model |
| Quiz | stage/podium model, answer panel model, timer model |
| Scratch Card | card model, table model, brand logo model |
| All Templates | environment map (HDRI), background textures |

## Dependencies
- Depends on: Provider Adapter interface, ConfigService for API keys, Asset Storage (for GLB/texture storage)
- Required by: All game template bundling skills, generate_intro_image skill

## Configuration
```yaml
# 3D Model Provider (Meshy AI)
MESHY_API_KEY: msy-... # Required
MESHY_API_BASE_URL: https://api.meshy.ai
MESHY_MAX_CONCURRENT: 2
MESHY_POLL_INTERVAL_MS: 10000
MESHY_TIMEOUT_MS: 600000

# 2D Image Provider (Nano Banana Pro)
NANO_BANANA_API_KEY: nb-... # Shared with video/audio providers
NANO_BANANA_IMAGE_TIMEOUT_MS: 60000

# Fallback 2D Provider (Stability AI)
STABILITY_API_KEY: sk-... # Optional fallback
STABILITY_DEFAULT_ENGINE: stable-diffusion-xl-1024-v1-0
```

## Cost Estimation
| Provider | Asset Type | Estimated Cost |
|----------|-----------|----------------|
| Meshy AI | Text-to-3D model | ~$0.20-0.50 per model |
| Meshy AI | Image-to-3D model | ~$0.20-0.50 per model |
| Nano Banana Pro | 1K-2K image | ~$0.05-0.13 per image |
| Nano Banana Pro | 4K image | ~$0.10-0.24 per image |
| Stability AI | 1024x1024 image | ~$0.02-0.06 per image |

## Success Criteria
- [ ] Text-to-3D generation returns valid GLB models with PBR materials
- [ ] Image-to-3D creates recognizable 3D models from reference images
- [ ] Generated GLB models load and render correctly in Three.js via GLTFLoader
- [ ] Models stay under 50k triangle budget for real-time rendering
- [ ] PBR materials (metalness, roughness, normal maps) render correctly
- [ ] 2D texture generation returns correctly sized images
- [ ] Seamless tiling textures tile without visible seams
- [ ] HDRI environment maps load correctly in Three.js via RGBELoader
- [ ] Rate limiting prevents 429 errors from providers
- [ ] API errors are properly caught and mapped to skill errors
- [ ] Generation costs are logged for each request
- [ ] Providers can be swapped without changing skill code (adapter pattern)
