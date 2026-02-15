# Quickstart: Campaign UI Feature

**Branch**: `012-campaign-ui`

## Prerequisites

1. Docker running with infrastructure services:
   ```bash
   docker compose up -d
   ```
2. Dependencies installed:
   ```bash
   pnpm install
   ```
3. Shared packages built:
   ```bash
   pnpm --filter @agentic-template/dto build
   pnpm --filter @agentic-template/common build
   pnpm --filter dao build
   ```

## Database Migration

After creating the Campaign entity and migration:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:run
```

To verify:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_template pnpm migration:show
```

## Development

Start all services:
```bash
pnpm -r --parallel dev
```

Or individually:
```bash
pnpm --filter api-center dev          # API on port 3001
pnpm --filter agent-platform dev      # Worker on port 3002
pnpm --filter webapp dev              # Frontend on port 5173
```

## Verify Backend

### Create a campaign draft
```bash
curl -X POST http://localhost:3001/campaigns \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Campaign", "templateId": "spin-wheel"}'
```

### List campaigns
```bash
curl http://localhost:3001/campaigns \
  -H "Authorization: Bearer $CLERK_TOKEN"
```

### Update campaign config
```bash
curl -X PATCH http://localhost:3001/campaigns/$CAMPAIGN_ID \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"config": {"theme": {"primaryColor": "#FF0000"}}, "expectedVersion": 1}'
```

### Trigger generation
```bash
curl -X POST http://localhost:3001/campaigns/$CAMPAIGN_ID/generate \
  -H "Authorization: Bearer $CLERK_TOKEN"
```

### Check run status
```bash
curl http://localhost:3001/runs/$RUN_ID \
  -H "Authorization: Bearer $CLERK_TOKEN"
```

### Test public player endpoint
```bash
curl http://localhost:3001/play/$CAMPAIGN_ID
```

## Verify Frontend

1. Navigate to http://localhost:5173
2. Sign in with Clerk
3. Go to /campaigns
4. Create a new campaign, trigger generation, and verify status updates

## Testing

```bash
pnpm --filter agent-platform test     # Backend unit tests
pnpm --filter webapp test:unit        # Frontend unit tests
```

## Build Order

When modifying shared packages, rebuild in dependency order:

```
dto → common → dao → api-center / agent-platform / webapp
```

## Key Files (after implementation)

| Purpose | Path |
| ------- | ---- |
| Campaign Entity | dao/src/entities/campaign.entity.ts |
| Migration | dao/src/migrations/{timestamp}-CreateCampaignTable.ts |
| Campaign DTOs | dto/src/campaign/ |
| API Controller | api-center/src/campaign/campaign.controller.ts |
| API Service | api-center/src/campaign/campaign-api.service.ts |
| Campaign Module | api-center/src/campaign/campaign.module.ts |
| Public Player Controller | api-center/src/campaign/public-player.controller.ts |
| Campaign Status Service | agent-platform/src/campaign/campaign-status.service.ts |
| Frontend Page | webapp/src/pages/CampaignsPage.vue |
| Frontend Store | webapp/src/stores/campaign.store.ts |
| Frontend Service | webapp/src/services/campaign.service.ts |
