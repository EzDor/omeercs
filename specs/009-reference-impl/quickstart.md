# Quickstart: Reference Implementations

**Feature**: 009-reference-impl
**Date**: 2026-02-03

## Prerequisites

- Docker and Docker Compose running
- Node.js 20.x with pnpm installed
- PostgreSQL running (via docker-compose)
- Redis/Valkey running (via docker-compose)
- LiteLLM proxy running (port 4000)
- At least one LLM API key configured (ANTHROPIC_API_KEY recommended)

## Setup

### 1. Start Infrastructure

```bash
# From repo root
docker compose up -d

# Verify services are running
docker compose ps
```

### 2. Build Packages

```bash
# Build in dependency order
pnpm --filter @agentic-template/dto build
pnpm --filter @agentic-template/common build
pnpm --filter dao build
```

### 3. Run Migrations

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template \
  pnpm migration:run
```

### 4. Start Services

```bash
# Start API and Worker in separate terminals
pnpm --filter api-center dev     # Terminal 1 - port 3001
pnpm --filter agent-platform dev # Terminal 2 - port 3002
```

## Running the Reference Implementation

### Execute Full Campaign Build (US1)

```bash
# Trigger minimal campaign build workflow
curl -X POST http://localhost:3001/api/workflows/campaign.build.minimal/trigger \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CLERK_TEST_TOKEN}" \
  -d '{
    "campaign_id": "test-campaign-001",
    "template_id": "collect_coins_v1",
    "difficulty": "medium",
    "theme": "neon_arcade",
    "assets": {
      "logo_uri": "https://placeholder.com/logo.png",
      "background_uri": "https://placeholder.com/bg.png"
    },
    "audio": {
      "prompt": "upbeat electronic game music with synth leads",
      "duration_sec": 60
    },
    "intro_video_uri": "file:///fixtures/placeholder-intro.mp4",
    "outcome_win_uri": "file:///fixtures/placeholder-win.mp4",
    "outcome_lose_uri": "file:///fixtures/placeholder-lose.mp4",
    "rules": {
      "win_score": 100,
      "time_limit_sec": 45
    }
  }'

# Response: { "run_id": "uuid-here", "status": "queued", ... }
```

### Monitor Run Status

```bash
# Check run status
curl http://localhost:3001/api/workflows/runs/${RUN_ID} \
  -H "Authorization: Bearer ${CLERK_TEST_TOKEN}"

# Check individual step statuses
curl http://localhost:3001/api/workflows/runs/${RUN_ID}/steps \
  -H "Authorization: Bearer ${CLERK_TEST_TOKEN}"
```

### Verify Artifacts (SC-001)

After run completes (`status: "completed"`):

```bash
# List artifacts produced
curl http://localhost:3001/api/workflows/runs/${RUN_ID}/artifacts \
  -H "Authorization: Bearer ${CLERK_TEST_TOKEN}"

# Expected 4 artifacts:
# - json/game-config
# - audio/bgm
# - bundle/game
# - json/campaign-manifest
```

### Execute Partial Rebuild - Audio Update (US5)

```bash
# Update audio with new prompt (reuses game_config from cache)
curl -X POST http://localhost:3001/api/workflows/campaign.update_audio/trigger \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CLERK_TEST_TOKEN}" \
  -d '{
    "base_run_id": "${ORIGINAL_RUN_ID}",
    "campaign_id": "test-campaign-001",
    "audio_overrides": {
      "prompt": "more energetic synthwave"
    }
  }'
```

### Verify Cache Reuse (SC-003)

```bash
# Check which steps were reused vs re-executed
curl http://localhost:3001/api/workflows/runs/${NEW_RUN_ID}/cache-analysis \
  -H "Authorization: Bearer ${CLERK_TEST_TOKEN}"

# Expected:
# - game_config: cache_hit = true, status = "skipped"
# - bgm: cache_hit = false, status = "completed"
# - bundle_game: cache_hit = false, status = "completed"
# - manifest: cache_hit = false, status = "completed"
```

## Testing Individual Skills

### Skill A: assemble_campaign_manifest (Deterministic)

```bash
# Direct skill invocation (for testing)
curl -X POST http://localhost:3002/api/skills/assemble_campaign_manifest/execute \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "test-001",
    "campaign_name": "Test Campaign",
    "intro_video_uri": "/fixtures/intro.mp4",
    "outcome_videos": {
      "win_video_uri": "/fixtures/win.mp4",
      "lose_video_uri": "/fixtures/lose.mp4"
    },
    "game_bundle_uri": "/tmp/test-bundle",
    "button_config": {
      "bounds": { "x": 100, "y": 200, "width": 150, "height": 50 }
    }
  }'
```

### Skill B: generate_bgm_track (Stub Provider)

```bash
# With stub provider (no real API call)
AUDIO_PROVIDER_STUB=true curl -X POST http://localhost:3002/api/skills/generate_bgm_track/execute \
  -H "Content-Type: application/json" \
  -d '{
    "style": {
      "genre": "electronic",
      "mood": "epic"
    },
    "duration_sec": 30,
    "loopable": true
  }'
```

### Skill C: game_config_from_template (Claude JSON)

```bash
# Claude generates valid game config
curl -X POST http://localhost:3002/api/skills/game_config_from_template/execute \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": "spin_wheel_v1",
    "theme": "neon_arcade",
    "difficulty": {
      "level": "medium",
      "win_probability": 0.3
    }
  }'
```

## Verifying Success Criteria

### SC-001: 4 Distinct Artifacts

```bash
# After full run, verify artifact types
curl http://localhost:3001/api/workflows/runs/${RUN_ID}/artifacts | \
  jq '.artifacts[].type'

# Should output:
# "json/game-config"
# "audio/bgm"
# "bundle/game"
# "json/campaign-manifest"
```

### SC-002: JSON Generation Success Rate

The `game_config_from_template` skill uses Claude's structured output with retry logic. Verify in logs:

```bash
# Check worker logs for retry attempts
docker compose logs agent-platform 2>&1 | grep "generation_retry"
```

### SC-003: Partial Rebuild Efficiency

```bash
# Cache analysis should show:
# - 1 step reused (game_config)
# - 3 steps re-executed (bgm, bundle_game, manifest)
curl http://localhost:3001/api/workflows/runs/${AUDIO_UPDATE_RUN_ID}/cache-analysis | \
  jq '.steps[] | {step_id, cache_hit}'
```

### SC-004: Execution Time (< 30s for stubs)

```bash
# Check total execution time
curl http://localhost:3001/api/workflows/runs/${RUN_ID} | \
  jq '.completed_at as $end | .started_at as $start | ($end | fromdateiso8601) - ($start | fromdateiso8601)'

# Should be < 30 seconds with stub providers
```

## Troubleshooting

### Common Issues

**Run stuck in "running" status**:
```bash
# Check BullMQ queue status
curl http://localhost:3002/api/health/queues

# Check for failed jobs
docker compose logs agent-platform 2>&1 | grep -i error
```

**LLM call fails**:
```bash
# Verify LiteLLM proxy is running
curl http://localhost:4000/health

# Check API key is configured
echo $ANTHROPIC_API_KEY
```

**Cache not working**:
```bash
# Check Redis connection
docker compose exec valkey redis-cli ping

# Verify step cache entries
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template \
  npx tsx -e "console.log('Cache check')"
```

### Enabling Debug Logging

```bash
# Set log level to debug
LOG_LEVEL=debug pnpm --filter agent-platform dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUDIO_PROVIDER_STUB` | Use stub audio provider | `false` |
| `SKILLS_OUTPUT_DIR` | Directory for skill outputs | `/tmp/skills/output` |
| `LITELLM_MODEL` | Default LLM model | `claude-sonnet` |
| `LOG_LEVEL` | Logging verbosity | `info` |

## Next Steps

After validating the reference implementation:

1. Replace stub audio provider with real provider integration
2. Implement real video generation skills
3. Add quality review gating with Claude critique
4. Expand workflow to full campaign.build.v1 (14 steps)
