# Video Provider - Runway

## Purpose
Integrate Runway ML's video generation API to replace the current stub video provider. Enable real AI-generated intro videos and outcome animations for game campaigns.

## User Stories

### P1 (Critical)
- US1: As the generate_intro_video_loop skill, I want to generate short looping videos from text/image so that campaigns have animated intros
- US2: As a skill handler, I want to generate videos from reference images so that animations match the campaign's visual style
- US3: As the system, I want to handle long-running jobs (Runway generation takes 1-5 minutes) so that workflows wait appropriately

### P2 (Important)
- US4: As the generate_outcome_video_win/lose skill, I want to generate celebration/consolation animations
- US5: As a skill handler, I want to specify video duration and aspect ratio so that videos fit game requirements
- US6: As an operator, I want to track generation costs (Runway uses credits) so that I can monitor spend

### P3 (Nice to Have)
- US7: As a skill handler, I want motion control parameters so that I can control camera movement
- US8: As a developer, I want to extend video duration beyond 4s using video-to-video

## Requirements

### Functional
- REQ1: Support text-to-video generation with prompts up to 500 characters
- REQ2: Support image-to-video generation (animate a still image)
- REQ3: Support durations: 4s (Gen-3), extendable via chaining
- REQ4: Support aspect ratios: 16:9 (landscape), 9:16 (portrait), 1:1 (square)
- REQ5: Return generated video as MP4 URL (Runway-hosted)
- REQ6: Support seamless loop generation for intro videos

### Technical
- REQ7: Use Runway Gen-3 Alpha API
- REQ8: Implement provider adapter pattern matching 003-provider-adapters spec
- REQ9: Implement polling for async jobs (check every 10s, timeout at 300s)
- REQ10: Handle credit-based billing (track credits per generation)
- REQ11: Download and re-upload to S3 for permanent storage

### Video Specifications
- REQ12: Output resolution: up to 1280x768 (Gen-3 Alpha)
- REQ13: Output format: MP4 (H.264)
- REQ14: Frame rate: 24fps

### Rate Limiting & Costs
- REQ15: Implement request queue (max 1 concurrent generation per tenant)
- REQ16: Track credits used per generation (varies by duration/resolution)
- REQ17: Respect Runway's API rate limits

## API Integration

### Runway API Flow
```
1. POST /v1/generations
   - Body: {
       prompt_text,
       prompt_image (base64),
       duration,
       aspect_ratio,
       seed (optional)
     }
   - Response: { id, status: 'PENDING' }

2. GET /v1/generations/{id}
   - Poll until status: 'SUCCEEDED'
   - Response: {
       status,
       output: [{ url }],
       credits_used
     }

3. Download video URL
```

### Response Handling
- Success: Return `{ video_url, duration_ms, credits_used }`
- Failure: Map errors to skill error codes
  - Insufficient credits: QUOTA_EXCEEDED_ERROR
  - Invalid prompt (content policy): INPUT_VALIDATION_ERROR
  - Generation failed: PROVIDER_ERROR
  - Timeout: TIMEOUT_ERROR

## Dependencies
- Depends on: Provider Adapter interface (003-provider-adapters), ConfigService for API key, Asset Storage (for permanent storage)
- Required by: generate_intro_video_loop skill, generate_outcome_video_win skill, generate_outcome_video_lose skill

## Configuration
```yaml
RUNWAY_API_KEY: rw-... # Required
RUNWAY_API_BASE_URL: https://api.runwayml.com
RUNWAY_MAX_CONCURRENT: 1
RUNWAY_POLL_INTERVAL_MS: 10000
RUNWAY_TIMEOUT_MS: 300000
```

## Cost Estimation
| Duration | Resolution | Estimated Credits |
|----------|------------|-------------------|
| 4s | 1280x768 | ~40 credits |
| 4s | 768x1280 | ~40 credits |

## Success Criteria
- [ ] Text-to-video generation returns valid MP4 video
- [ ] Image-to-video animates the provided image
- [ ] Generated videos match requested aspect ratio
- [ ] Async polling correctly waits for generation completion
- [ ] Timeout handling works when generation exceeds 5 minutes
- [ ] Video URLs are valid and downloadable
- [ ] Credits used are tracked per generation
- [ ] Provider can be swapped without changing skill code (adapter pattern)
