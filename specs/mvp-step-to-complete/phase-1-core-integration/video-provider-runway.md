# Video Provider - Nano Banana

## Purpose
Integrate Nano Banana Video's AI video generation API (powered by Google's Gemini/Veo models) to replace the current stub video provider. Nano Banana Video is capable of creating studio-quality cinematic videos from text or image prompts, with support for multi-scene generation with consistent characters and objects. It will be used for campaign intro videos, outcome animations, and promotional video content for 3D game campaigns.

## User Stories

### P1 (Critical)
- US1: As the generate_intro_video_loop skill, I want to generate short looping videos from text/image so that campaigns have animated intros
- US2: As a skill handler, I want to generate videos from reference images (including 3D renders from game scenes) so that animations match the campaign's visual style
- US3: As the system, I want to handle async generation jobs so that workflows wait appropriately

### P2 (Important)
- US4: As the generate_outcome_video_win/lose skill, I want to generate celebration/consolation animations
- US5: As a skill handler, I want to specify video duration, resolution, and motion level so that videos fit game requirements
- US6: As an operator, I want to track generation costs so that I can monitor API spend

### P3 (Nice to Have)
- US7: As a skill handler, I want camera movement control so that I can create dynamic video angles
- US8: As a developer, I want multi-scene generation with consistent branding elements across scenes

## Requirements

### Functional
- REQ1: Support text-to-video generation with rich descriptive prompts
- REQ2: Support image-to-video generation (animate a still image or 3D render)
- REQ3: Support durations suitable for game intros and outcomes (4-15 seconds)
- REQ4: Support resolutions: 1080p in landscape (16:9), portrait (9:16), and square (1:1)
- REQ5: Return generated video as MP4 URL
- REQ6: Support seamless loop generation for intro videos
- REQ7: Multi-scene generation with consistent characters and branded elements

### Technical
- REQ8: Use Nano Banana Video SDK (`@nanobanana/video`) for JavaScript integration
- REQ9: Implement provider adapter pattern matching existing provider-adapters spec
- REQ10: Implement polling for async jobs (check every 5s, timeout at 300s)
- REQ11: Download and re-upload to S3 for permanent storage
- REQ12: Support configurable motion level and camera movement parameters

### Video Specifications
- REQ13: Output resolution: up to 1920x1080 (1080p)
- REQ14: Output format: MP4 (H.264)
- REQ15: Frame rate: 24-30fps

### Rate Limiting & Costs
- REQ16: Implement request queue (max 2 concurrent generations per tenant)
- REQ17: Track credits/cost per generation
- REQ18: Respect Nano Banana API rate limits

## API Integration

### Nano Banana Video API Flow
```
1. POST /v1/generate
   - Body: {
       prompt,
       duration_seconds,
       resolution: '1080p',
       motion_level: 'medium',
       camera_movement: 'static' | 'pan' | 'zoom' | 'orbit',
       reference_image (base64, optional),
       loop: boolean
     }
   - Response: { job_id, status: 'pending' }

2. GET /v1/jobs/{job_id}
   - Poll until status: 'completed'
   - Response: {
       status,
       video_url,
       duration_ms,
       resolution,
       cost
     }

3. Download video URL
```

### SDK Usage
```typescript
import { NanoBananaVideo } from '@nanobanana/video';

const client = new NanoBananaVideo({ apiKey: process.env.NANO_BANANA_API_KEY });
const result = await client.generate({
  prompt: 'A spinning prize wheel with golden metallic segments...',
  duration: 5,
  resolution: '1080p',
  motion_level: 'medium',
});
```

### Response Handling
- Success: Return `{ video_url, duration_ms, cost }`
- Failure: Map errors to skill error codes
  - Insufficient credits: QUOTA_EXCEEDED_ERROR
  - Invalid prompt (content policy): INPUT_VALIDATION_ERROR
  - Generation failed: PROVIDER_ERROR
  - Timeout: TIMEOUT_ERROR

## Dependencies
- Depends on: Provider Adapter interface, ConfigService for API key, Asset Storage (for permanent storage)
- Required by: generate_intro_video_loop skill, generate_outcome_video_win skill, generate_outcome_video_lose skill

## Configuration
```yaml
NANO_BANANA_API_KEY: nb-... # Required
NANO_BANANA_API_BASE_URL: https://api.nanobananavideo.com
NANO_BANANA_MAX_CONCURRENT: 2
NANO_BANANA_POLL_INTERVAL_MS: 5000
NANO_BANANA_TIMEOUT_MS: 300000
```

## Cost Estimation
| Duration | Resolution | Estimated Cost |
|----------|------------|----------------|
| 5s | 1080p | ~$0.10-0.20 |
| 10s | 1080p | ~$0.15-0.30 |
| 15s | 1080p | ~$0.20-0.40 |

## Success Criteria
- [ ] Text-to-video generation returns valid MP4 video
- [ ] Image-to-video animates the provided image/3D render
- [ ] Generated videos match requested resolution and aspect ratio
- [ ] Async polling correctly waits for generation completion
- [ ] Timeout handling works when generation exceeds 5 minutes
- [ ] Video URLs are valid and downloadable
- [ ] Costs are tracked per generation
- [ ] Loop mode produces seamlessly looping video
- [ ] Provider can be swapped without changing skill code (adapter pattern)
