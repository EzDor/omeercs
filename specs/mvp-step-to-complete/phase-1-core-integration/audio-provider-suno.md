# Audio Provider - Suno

## Purpose
Integrate Suno's AI music generation API to replace the current stub audio provider. Enable real AI-generated background music (BGM) and sound effects (SFX) for game campaigns.

## User Stories

### P1 (Critical)
- US1: As the generate_bgm_track skill, I want to generate background music from text descriptions so that campaigns have unique audio
- US2: As a skill handler, I want to specify music style/genre so that audio matches the campaign theme
- US3: As the system, I want to handle async generation (Suno jobs take 30-120s) so that workflows wait appropriately

### P2 (Important)
- US4: As a skill handler, I want to specify track duration so that BGM loops match game length requirements
- US5: As the generate_sfx_pack skill, I want to generate sound effects so that games have UI feedback sounds
- US6: As an operator, I want to track generation costs so that I can monitor API spend

### P3 (Nice to Have)
- US7: As a skill handler, I want instrumental-only generation so that BGM doesn't have vocals
- US8: As a developer, I want to extend existing tracks so that I can create longer versions

## Requirements

### Functional
- REQ1: Support text-to-music generation with prompts up to 500 characters
- REQ2: Support music styles: electronic, orchestral, rock, jazz, ambient, pop, hip-hop
- REQ3: Support durations: 30s, 60s, 90s, 120s (Suno standard lengths)
- REQ4: Return generated audio as MP3 URL (Suno-hosted, expires after 7 days)
- REQ5: Support instrumental mode (no vocals)
- REQ6: Support SFX generation for: button_click, win, lose, countdown, notification

### Technical
- REQ7: Use Suno API (unofficial API or official when available)
- REQ8: Implement provider adapter pattern matching 003-provider-adapters spec
- REQ9: Implement polling for async jobs (check every 5s, timeout at 180s)
- REQ10: Handle job queuing - Suno may queue requests during high load
- REQ11: Download and re-upload to S3 before Suno URL expires (if asset-storage available)

### Rate Limiting & Costs
- REQ12: Implement request queue (max 2 concurrent generations per tenant)
- REQ13: Track credits used per generation
- REQ14: Respect Suno's rate limits (varies by subscription tier)

## API Integration

### Suno API Flow
```
1. POST /api/generate
   - Body: { prompt, style, duration, instrumental }
   - Response: { job_id, status: 'queued' }

2. GET /api/status/{job_id}
   - Poll until status: 'completed'
   - Response: { status, audio_url, duration_ms }

3. Download audio_url before expiration
```

### Response Handling
- Success: Return `{ audio_url, duration_ms, style }`
- Failure: Map errors to skill error codes
  - Queue full: RATE_LIMIT_ERROR
  - Invalid prompt: INPUT_VALIDATION_ERROR
  - Generation failed: PROVIDER_ERROR

## Dependencies
- Depends on: Provider Adapter interface (003-provider-adapters), ConfigService for API key
- Required by: generate_bgm_track skill, generate_sfx_pack skill, mix_audio_for_game skill

## Configuration
```yaml
SUNO_API_KEY: sk-... # Required (or cookie-based auth for unofficial API)
SUNO_API_BASE_URL: https://api.suno.ai
SUNO_MAX_CONCURRENT: 2
SUNO_POLL_INTERVAL_MS: 5000
SUNO_TIMEOUT_MS: 180000
```

## Success Criteria
- [ ] Text-to-music generation returns valid MP3 audio
- [ ] Generated tracks match requested style/genre
- [ ] Duration matches requested length (±5s tolerance)
- [ ] Instrumental mode produces tracks without vocals
- [ ] Async polling correctly waits for generation completion
- [ ] Timeout handling works when generation exceeds 180s
- [ ] Audio URLs are valid and downloadable
- [ ] Provider can be swapped without changing skill code (adapter pattern)
