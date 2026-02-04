# System Testing Playbook

Execute this playbook to perform comprehensive system testing and generate a report.

## Instructions

You are a testing agent. Execute each section in order, record results, and generate a final report.

---

## Phase 1: Prerequisites Check

Verify the following before proceeding:

```bash
# Check Docker is running
docker info > /dev/null 2>&1 && echo "Docker: OK" || echo "Docker: FAILED"

# Check .env file exists
[ -f .env ] && echo ".env: OK" || echo ".env: MISSING"

# Check Node version
node --version

# Check pnpm
pnpm --version
```

**Record:** Prerequisites status (all must pass to continue)

---

## Phase 2: Infrastructure Verification

### 2.1 Check Docker Services
```bash
docker compose ps
```

**Expected:** center-db, valkey, litellm-proxy all with status "healthy"

### 2.2 Start Services if Not Running
```bash
docker compose up -d
```

Wait 30 seconds for services to become healthy, then verify:

```bash
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

### 2.3 Verify LiteLLM Health
```bash
curl -s http://localhost:4000/health/liveliness
```

**Expected:** `"I'm alive!"`

### 2.4 Verify Environment Variables
```bash
grep -E "^(GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|CLERK_PUBLISHABLE_KEY|CLERK_SECRET_KEY)=" .env | wc -l
```

**Expected:** At least 3 (Clerk keys + at least one LLM key)

**Record:** Infrastructure status for report

---

## Phase 3: Build Verification

Execute builds in dependency order:

```bash
# Install dependencies
pnpm install

# Build DTO package
pnpm --filter @agentic-template/dto build
echo "DTO build: $?"

# Build Common package
pnpm --filter @agentic-template/common build
echo "Common build: $?"

# Build DAO package
pnpm --filter dao build
echo "DAO build: $?"
```

**Expected:** All exit codes should be 0

**Record:** Build status for each package

---

## Phase 4: Test Execution

### 4.1 Agent-Platform E2E Tests (40 tests)
```bash
DATABASE_URL=postgresql://app_user:app_pass@localhost:5432/agentic_template \
APP_SCHEMA=app \
pnpm --filter @agentic-template/agent-platform test:e2e 2>&1
```

**Expected:** 5 test suites, 40 tests passing

**Record:**
- Test suites: passed/total
- Tests: passed/total
- Any failures with details

### 4.2 Agent-Platform Unit Tests (65 tests)
```bash
DATABASE_URL=postgresql://app_user:app_pass@localhost:5432/agentic_template \
APP_SCHEMA=app \
npx jest --testRegex=".*\.spec\.ts$" --roots="$(pwd)/agent-platform/test" --passWithNoTests 2>&1
```

**Expected:** ~44 pass, ~21 fail (known mock issues with LlmGenerationService)

**Record:**
- Tests: passed/failed/total
- Known failures vs new failures

### 4.3 Lint Check
```bash
pnpm --filter @agentic-template/agent-platform lint 2>&1 | tail -5
```

**Expected:** No errors

---

## Phase 5: Agent Capabilities Verification

### 5.1 Verify Skill Handlers Exist (16 total)

Check that all handler files exist:
```bash
HANDLERS=(
  "campaign-plan-from-brief.handler.ts"
  "game-config-from-template.handler.ts"
  "review-asset-quality.handler.ts"
  "generate-intro-image.handler.ts"
  "segment-start-button.handler.ts"
  "generate-intro-video-loop.handler.ts"
  "generate-outcome-video-win.handler.ts"
  "generate-outcome-video-lose.handler.ts"
  "generate-bgm-track.handler.ts"
  "generate-sfx-pack.handler.ts"
  "mix-audio-for-game.handler.ts"
  "generate-3d-asset.handler.ts"
  "optimize-3d-asset.handler.ts"
  "bundle-game-template.handler.ts"
  "validate-game-bundle.handler.ts"
  "assemble-campaign-manifest.handler.ts"
)

HANDLERS_DIR="agent-platform/src/skills/handlers"
FOUND=0
for h in "${HANDLERS[@]}"; do
  [ -f "$HANDLERS_DIR/$h" ] && ((FOUND++))
done
echo "Skill handlers found: $FOUND/16"
```

**Expected:** 16/16 handlers found

### 5.2 Verify Workflow Files Exist (7 total)

```bash
WORKFLOWS_DIR="agent-platform/workflows"
ls -1 "$WORKFLOWS_DIR"/*.yaml 2>/dev/null | wc -l
```

**Expected:** 8 files (7 workflows + index.yaml)

List workflows:
```bash
ls -1 agent-platform/workflows/*.yaml
```

### 5.3 Verify Run Engine Services (14 total)

```bash
SERVICES_DIR="agent-platform/src/run-engine/services"
ls -1 "$SERVICES_DIR"/*.service.ts 2>/dev/null | wc -l
```

**Expected:** 14+ service files

### 5.4 Verify Skill Runner Services (7 total)

```bash
# Main skill runner
ls -1 agent-platform/src/skills/skill-runner/*.service.ts 2>/dev/null | wc -l

# Additional services
ls -1 agent-platform/src/skills/services/*.service.ts 2>/dev/null | wc -l
```

### 5.5 Verify Test Fixtures Exist

```bash
ls -la agent-platform/test/fixtures/
```

**Expected files:**
- campaign-build-trigger.json
- game-config-input.json
- bgm-input.json
- audio-update-trigger.json
- videos/ directory with placeholder MP4s

---

## Phase 6: Service Startup Test (Optional - May Fail)

**Note:** Services may fail to start due to known issues. Document any errors.

### 6.1 Test api-center Startup
```bash
export DATABASE_URL=postgresql://app_user:app_pass@localhost:5432/agentic_template
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_PASSWORD=devpassword
export LITELLM_BASE_URL=http://localhost:4000
export LITELLM_API_KEY=sk-1234
export APP_SCHEMA=app
export CLERK_PUBLISHABLE_KEY=$(awk -F= '/^CLERK_PUBLISHABLE_KEY=/{print $2}' .env)
export CLERK_SECRET_KEY=$(awk -F= '/^CLERK_SECRET_KEY=/{print $2}' .env)

timeout 30 pnpm --filter @agentic-template/api-server dev 2>&1 | tail -20
```

**Record:** Started successfully or error message

### 6.2 Test agent-platform Startup
```bash
export DATABASE_URL=postgresql://app_user:app_pass@localhost:5432/agentic_template
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_PASSWORD=devpassword
export LITELLM_BASE_URL=http://localhost:4000
export LITELLM_API_KEY=sk-1234
export APP_SCHEMA=app

timeout 30 pnpm --filter @agentic-template/agent-platform dev 2>&1 | tail -20
```

**Record:** Started successfully or error message

---

## Phase 7: Generate Report

Create the reports directory if it doesn't exist:
```bash
mkdir -p reports
```

Create a file `reports/SYSTEM_ANALYSIS_REPORT.md` with the following template filled in:

```markdown
# System Analysis Report

**Date:** [CURRENT_DATE]
**Tested by:** Claude Code Agent

---

## Executive Summary

| Category | Passed | Failed | Skipped | Notes |
|----------|--------|--------|---------|-------|
| Prerequisites | /4 | | | |
| Infrastructure | /3 | | | |
| Builds | /3 | | | |
| E2E Tests | /40 | | | |
| Unit Tests | /65 | | | |
| Skill Handlers | /16 | | | |
| Workflows | /7 | | | |
| Services | /21 | | | |

---

## Infrastructure Status

| Component | Port | Status | Health Check |
|-----------|------|--------|--------------|
| PostgreSQL (center-db) | 5432 | [STATUS] | [RESULT] |
| Valkey (Redis) | 6379 | [STATUS] | [RESULT] |
| LiteLLM Proxy | 4000 | [STATUS] | [RESULT] |

---

## Build Results

| Package | Status | Exit Code |
|---------|--------|-----------|
| @agentic-template/dto | [STATUS] | [CODE] |
| @agentic-template/common | [STATUS] | [CODE] |
| @agentic-template/dao | [STATUS] | [CODE] |

---

## Test Results

### E2E Tests
- **Suites:** [PASSED]/[TOTAL]
- **Tests:** [PASSED]/[TOTAL]
- **Time:** [DURATION]

### Unit Tests
- **Suites:** [PASSED]/[TOTAL]
- **Tests:** [PASSED]/[TOTAL]
- **Known Failures:** [LIST]

---

## Agent Capabilities

### Skill Handlers (16)
| # | Skill ID | Status |
|---|----------|--------|
| 1 | campaign_plan_from_brief | [STATUS] |
| 2 | game_config_from_template | [STATUS] |
| 3 | review_asset_quality | [STATUS] |
| 4 | generate_intro_image | [STATUS] |
| 5 | segment_start_button | [STATUS] |
| 6 | generate_intro_video_loop | [STATUS] |
| 7 | generate_outcome_video_win | [STATUS] |
| 8 | generate_outcome_video_lose | [STATUS] |
| 9 | generate_bgm_track | [STATUS] |
| 10 | generate_sfx_pack | [STATUS] |
| 11 | mix_audio_for_game | [STATUS] |
| 12 | generate_3d_asset | [STATUS] |
| 13 | optimize_3d_asset | [STATUS] |
| 14 | bundle_game_template | [STATUS] |
| 15 | validate_game_bundle | [STATUS] |
| 16 | assemble_campaign_manifest | [STATUS] |

### Workflows (7)
| # | Workflow | Version | Status |
|---|----------|---------|--------|
| 1 | campaign.build | 1.0.0 | [STATUS] |
| 2 | campaign.build.minimal | 1.0.0 | [STATUS] |
| 3 | campaign.update_audio | 1.0.0 | [STATUS] |
| 4 | campaign.update_intro | 1.0.0 | [STATUS] |
| 5 | campaign.update_outcome | 1.0.0 | [STATUS] |
| 6 | campaign.update_game_config | 1.0.0 | [STATUS] |
| 7 | campaign.replace_3d_asset | 1.0.0 | [STATUS] |

### Run Engine Services (14)
[LIST_SERVICES_WITH_STATUS]

### Skill Runner Services (7)
[LIST_SERVICES_WITH_STATUS]

---

## Issues Found

1. **[ISSUE_TITLE]**
   - Location: [FILE_PATH]
   - Error: [ERROR_MESSAGE]
   - Impact: [IMPACT_DESCRIPTION]

---

## Recommendations

1. [RECOMMENDATION_1]
2. [RECOMMENDATION_2]

---

## Test Fixtures Verified

| Fixture | Path | Status |
|---------|------|--------|
| campaign-build-trigger.json | test/fixtures/ | [STATUS] |
| game-config-input.json | test/fixtures/ | [STATUS] |
| bgm-input.json | test/fixtures/ | [STATUS] |
| audio-update-trigger.json | test/fixtures/ | [STATUS] |
| Video placeholders | test/fixtures/videos/ | [STATUS] |
```

---

## Completion Checklist

Before finishing, ensure:
- [ ] All phases executed
- [ ] All results recorded
- [ ] Report generated at `reports/SYSTEM_ANALYSIS_REPORT.md`
- [ ] Any blocking issues clearly documented

**Note:** The `reports/` directory is git-ignored to keep reports local.

**End of Playbook**
