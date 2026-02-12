# Image Provider - Stability AI

## Purpose
Integrate Stability AI's image generation API to replace the current stub image provider. Enable real AI-generated images for campaign intro screens, game backgrounds, and promotional assets.

## User Stories

### P1 (Critical)
- US1: As the generate_intro_image skill, I want to generate high-quality images from text prompts so that campaigns have unique visual assets
- US2: As a skill handler, I want to specify image dimensions so that generated images fit the required aspect ratio (16:9, 1:1, 9:16)
- US3: As the system, I want proper error handling for API failures so that workflows can retry or fail gracefully

### P2 (Important)
- US4: As a skill handler, I want style presets (photorealistic, illustration, anime) so that images match the campaign theme
- US5: As an operator, I want to track API costs per generation so that I can monitor spend and bill tenants
- US6: As the system, I want rate limiting to respect Stability AI quotas so that we don't exceed API limits

### P3 (Nice to Have)
- US7: As a skill handler, I want image-to-image generation so that I can create variations of existing assets
- US8: As a developer, I want to use different Stability models (SDXL, SD3) based on quality requirements

## Requirements

### Functional
- REQ1: Support text-to-image generation with prompts up to 2000 characters
- REQ2: Support output resolutions: 512x512, 768x768, 1024x1024, 1024x576 (16:9), 576x1024 (9:16)
- REQ3: Support negative prompts to exclude unwanted elements
- REQ4: Return generated image as buffer or URL (provider-hosted for 24h)
- REQ5: Support style presets: photographic, digital-art, anime, comic-book, fantasy-art
- REQ6: Configurable number of images per request (1-4)

### Technical
- REQ7: Use Stability AI REST API v1 (https://api.stability.ai)
- REQ8: Implement provider adapter pattern matching 003-provider-adapters spec
- REQ9: Handle async generation with polling (check status every 2s, timeout at 60s)
- REQ10: Parse and propagate API errors with meaningful error codes
- REQ11: Store generation metadata in debug output (model used, seed, cfg_scale)

### Rate Limiting & Costs
- REQ12: Implement token bucket rate limiter (default: 10 requests/minute)
- REQ13: Track cost per request based on resolution and model
- REQ14: Log cost data to run_steps.debug for billing analysis

## API Integration

### Stability AI Endpoints
```
POST /v1/generation/{engine_id}/text-to-image
- engine_id: stable-diffusion-xl-1024-v1-0
- Headers: Authorization: Bearer {STABILITY_API_KEY}
- Body: { text_prompts, cfg_scale, height, width, samples, steps, style_preset }
```

### Response Handling
- Success: Extract base64 image from `artifacts[0].base64`
- Failure: Map API error codes to skill error codes
  - 400: INPUT_VALIDATION_ERROR
  - 401/403: PROVIDER_AUTH_ERROR
  - 429: RATE_LIMIT_ERROR
  - 500+: PROVIDER_ERROR

## Dependencies
- Depends on: Provider Adapter interface (003-provider-adapters), ConfigService for API key
- Required by: generate_intro_image skill, segment_start_button skill

## Configuration
```yaml
STABILITY_API_KEY: sk-... # Required
STABILITY_DEFAULT_ENGINE: stable-diffusion-xl-1024-v1-0
STABILITY_RATE_LIMIT_RPM: 10
STABILITY_TIMEOUT_MS: 60000
```

## Success Criteria
- [ ] Text-to-image generation returns valid PNG/JPEG images
- [ ] All supported resolutions produce correctly sized images
- [ ] Style presets visibly affect output style
- [ ] Rate limiting prevents 429 errors from Stability AI
- [ ] API errors are properly caught and mapped to skill errors
- [ ] Generation costs are logged for each request
- [ ] Provider can be swapped without changing skill code (adapter pattern)
