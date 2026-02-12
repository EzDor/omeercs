# Audio Provider - Nano Banana / Suno

## Purpose
Provide AI-generated audio for game campaigns using a dual-provider architecture. Nano Banana (powered by Google's Gemini models) serves as the primary provider for short-form sound effects (SFX), while Suno handles longer background music (BGM) tracks. Provider selection is automatic based on audio type, and both implement the same adapter interface.

## User Stories

### P1 (Critical)
- US1: As the generate_bgm_track skill, I want to generate background music from text descriptions so that campaigns have unique audio
- US2: As the generate_sfx_pack skill, I want to generate short sound effects (spin, flip, scratch, win, lose) so that 3D games have immersive audio feedback
- US3: As the system, I want automatic provider routing (SFX -> Nano Banana, BGM -> Suno) so that each audio type uses the optimal provider

### P2 (Important)
- US4: As a skill handler, I want to specify music style/genre so that BGM matches the campaign theme
- US5: As a skill handler, I want to specify SFX descriptions (e.g., "metallic scratch sound", "coin flip") so that effects match 3D game interactions
- US6: As an operator, I want to track generation costs across both providers so that I can monitor API spend

### P3 (Nice to Have)
- US7: As a skill handler, I want instrumental-only BGM generation so that music doesn't have vocals
- US8: As a developer, I want fallback between providers so that generation works even if one provider is down

## Requirements

### Nano Banana Audio (Primary for SFX)
- REQ1: Generate short-form sound effects (0.5-5 seconds) from descriptive text prompts
- REQ2: Support game SFX types: button_click, spin, tick, flip, scratch, match, win, lose, countdown, reveal, confetti
- REQ3: Fast generation time (< 10 seconds per SFX)
- REQ4: Output format: MP3 or WAV
- REQ5: Use Nano Banana's audio generation capabilities via API

### Suno Audio (Primary for BGM)
- REQ6: Generate background music tracks from text prompts with genre/style specification
- REQ7: Support music styles: electronic, orchestral, rock, jazz, ambient, pop, hip-hop
- REQ8: Support durations: 30s, 60s, 90s, 120s
- REQ9: Support instrumental mode (no vocals)
- REQ10: Return generated audio as MP3 URL

### Provider Routing
- REQ11: Automatic provider selection based on audio type: `sfx` -> Nano Banana, `bgm` -> Suno
- REQ12: Both providers implement the same AudioProviderAdapter interface
- REQ13: Fallback: if primary provider fails, attempt the secondary provider

### Technical
- REQ14: Implement provider adapter pattern matching existing provider-adapters spec
- REQ15: Implement polling for async jobs (Nano Banana: check every 2s, timeout 30s; Suno: check every 5s, timeout 180s)
- REQ16: Download and re-upload to S3 for permanent storage before provider URLs expire

### Rate Limiting & Costs
- REQ17: Implement request queue (max 2 concurrent per provider per tenant)
- REQ18: Track costs per generation per provider
- REQ19: Respect rate limits for both providers

## API Integration

### Nano Banana Audio API Flow (SFX)
```
1. POST /v1/audio/generate
   - Body: { prompt, duration_seconds, format: 'mp3' | 'wav' }
   - Response: { job_id, status: 'pending' }

2. GET /v1/audio/jobs/{job_id}
   - Poll until status: 'completed'
   - Response: { status, audio_url, duration_ms }

3. Download audio_url
```

### Suno API Flow (BGM)
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
- Success: Return `{ audio_url, duration_ms, provider, audio_type }`
- Failure: Map errors to skill error codes
  - Queue full: RATE_LIMIT_ERROR
  - Invalid prompt: INPUT_VALIDATION_ERROR
  - Generation failed: PROVIDER_ERROR

## Dependencies
- Depends on: Provider Adapter interface, ConfigService for API keys, Asset Storage
- Required by: generate_bgm_track skill, generate_sfx_pack skill, mix_audio_for_game skill

## Configuration
```yaml
# Nano Banana Audio (SFX)
NANO_BANANA_API_KEY: nb-... # Shared with video provider
NANO_BANANA_AUDIO_POLL_INTERVAL_MS: 2000
NANO_BANANA_AUDIO_TIMEOUT_MS: 30000

# Suno Audio (BGM)
SUNO_API_KEY: sk-...
SUNO_API_BASE_URL: https://api.suno.ai
SUNO_MAX_CONCURRENT: 2
SUNO_POLL_INTERVAL_MS: 5000
SUNO_TIMEOUT_MS: 180000
```

## Cost Estimation
| Provider | Type | Duration | Estimated Cost |
|----------|------|----------|----------------|
| Nano Banana | SFX | 1-5s | ~$0.01-0.05 |
| Suno | BGM | 30s | ~$0.05-0.10 |
| Suno | BGM | 60s | ~$0.08-0.15 |
| Suno | BGM | 120s | ~$0.12-0.25 |

## Success Criteria
- [ ] SFX generation via Nano Banana returns valid short-form audio
- [ ] BGM generation via Suno returns valid music tracks
- [ ] Automatic provider routing selects correct provider based on audio type
- [ ] Generated SFX match descriptive prompts (scratch sounds, win jingles, etc.)
- [ ] Generated BGM tracks match requested style/genre
- [ ] Instrumental mode produces tracks without vocals
- [ ] Async polling correctly waits for generation completion for both providers
- [ ] Timeout handling works for both providers
- [ ] Audio URLs are valid and downloadable
- [ ] Costs are tracked per generation per provider
- [ ] Both providers can be swapped without changing skill code (adapter pattern)
