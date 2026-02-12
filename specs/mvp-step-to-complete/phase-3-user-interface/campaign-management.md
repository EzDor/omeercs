# Campaign Management

## Purpose
A dashboard for managing all campaigns: viewing list, editing drafts, duplicating, archiving, and accessing campaign analytics. Serves as the home base for marketers working with campaigns.

## User Stories

### P1 (Critical)
- US1: As a marketer, I want to see all my campaigns in a list so that I can find and manage them
- US2: As a marketer, I want to edit a draft campaign so that I can make changes before generating
- US3: As a marketer, I want to delete/archive a campaign so that I can clean up my workspace

### P2 (Important)
- US4: As a marketer, I want to duplicate a campaign so that I can create variations without starting from scratch
- US5: As a marketer, I want to filter campaigns by status (draft, generating, live, archived) so that I can focus on relevant ones
- US6: As a marketer, I want to see basic analytics (plays, completions, win rate) so that I know how campaigns are performing

### P3 (Nice to Have)
- US7: As a marketer, I want to organize campaigns into folders/tags so that I can manage large numbers
- US8: As a marketer, I want to export campaign data so that I can analyze offline

## Requirements

### Campaign List View
- REQ1: Display campaigns as cards or table (user preference)
- REQ2: Show: name, template type, status, created date, thumbnail
- REQ3: Filter by: status (draft, generating, live, archived), template type, date range
- REQ4: Sort by: name, created date, updated date, plays
- REQ5: Search by campaign name
- REQ6: Pagination (20 campaigns per page)

### Campaign Card/Row
- REQ7: Thumbnail preview of campaign
- REQ8: Status badge (draft, generating, live, archived)
- REQ9: Quick actions: edit, duplicate, preview, delete
- REQ10: Template type indicator
- REQ11: Last modified date

### Campaign Actions
- REQ12: Edit: opens campaign builder with saved state (draft only)
- REQ13: Duplicate: creates copy with "(Copy)" suffix
- REQ14: Preview: opens campaign preview player
- REQ15: Archive: soft delete, moves to archived status
- REQ16: Delete: hard delete with confirmation (draft only)
- REQ17: Regenerate: trigger new workflow run (live campaigns)

### Campaign Statuses
| Status | Description | Allowed Actions |
|--------|-------------|-----------------|
| draft | Not yet generated | edit, duplicate, delete |
| generating | Workflow running | view progress, cancel |
| live | Successfully generated | preview, duplicate, archive, regenerate |
| failed | Generation failed | edit, retry, delete |
| archived | Soft deleted | restore, hard delete |

### Analytics Summary
- REQ18: Total plays (views)
- REQ19: Total completions (game finished)
- REQ20: Win rate (completions that won)
- REQ21: Conversion rate (if tracking enabled)
- REQ22: Sparkline chart for plays over time

### Bulk Actions
- REQ23: Select multiple campaigns
- REQ24: Bulk archive selected
- REQ25: Bulk delete selected (drafts only)

## Data Model

### Campaign Entity (if not exists)
```typescript
interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  templateId: string;
  status: 'draft' | 'generating' | 'live' | 'failed' | 'archived';
  config: CampaignConfig;         // Game configuration
  lastRunId?: string;             // Most recent generation run
  bundleUrl?: string;             // CDN URL when live
  thumbnailUrl?: string;          // Preview image
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
  analytics?: CampaignAnalytics;
}

interface CampaignAnalytics {
  totalPlays: number;
  totalCompletions: number;
  totalWins: number;
  lastPlayAt?: Date;
}
```

## API Integration

### Endpoints
```typescript
// List campaigns
GET /api/campaigns?status=live&limit=20&offset=0
Response: { campaigns: Campaign[], total: number }

// Get campaign detail
GET /api/campaigns/{campaignId}
Response: Campaign

// Create campaign draft
POST /api/campaigns
Body: { name, templateId, config }
Response: Campaign

// Update campaign
PATCH /api/campaigns/{campaignId}
Body: Partial<Campaign>
Response: Campaign

// Delete campaign
DELETE /api/campaigns/{campaignId}

// Duplicate campaign
POST /api/campaigns/{campaignId}/duplicate
Response: Campaign

// Archive campaign
POST /api/campaigns/{campaignId}/archive
Response: Campaign

// Restore campaign
POST /api/campaigns/{campaignId}/restore
Response: Campaign

// Get campaign analytics
GET /api/campaigns/{campaignId}/analytics
Response: CampaignAnalytics
```

## UI Components

### Vue Component Structure
```
/webapp/src/views/campaigns/
├── CampaignListView.vue
├── components/
│   ├── CampaignGrid.vue         # Card layout
│   ├── CampaignTable.vue        # Table layout
│   ├── CampaignCard.vue         # Individual campaign card
│   ├── CampaignFilters.vue      # Status, type, date filters
│   ├── CampaignSearch.vue       # Search input
│   ├── CampaignActions.vue      # Dropdown menu
│   ├── AnalyticsSummary.vue     # Quick stats
│   ├── BulkActionsBar.vue       # Actions for selected
│   ├── DeleteConfirmModal.vue
│   └── DuplicateModal.vue       # Rename on duplicate
```

### Pinia Store
```typescript
// stores/campaigns.ts
interface CampaignsState {
  campaigns: Campaign[];
  currentCampaign: Campaign | null;
  filters: CampaignFilters;
  pagination: { offset: number, limit: number, total: number };
  selectedIds: string[];
  viewMode: 'grid' | 'table';
  isLoading: boolean;
}
```

## Navigation & Routes
```
/campaigns                    # Campaign list (default)
/campaigns/new                # Create new (opens builder)
/campaigns/{id}               # Campaign detail (redirects to builder or preview)
/campaigns/{id}/edit          # Edit in builder
/campaigns/{id}/analytics     # Detailed analytics (future)
```

## Dependencies
- Depends on: Campaign Builder (for edit action), Campaign Preview Player (for preview), Run Monitoring (for generation status)
- Required by: Main navigation, Dashboard

## Success Criteria
- [ ] Campaign list loads with correct data
- [ ] Filters reduce list appropriately
- [ ] Search finds campaigns by name
- [ ] Edit opens builder with saved state
- [ ] Duplicate creates working copy
- [ ] Delete removes campaign (with confirmation)
- [ ] Archive moves to archived status
- [ ] Status transitions correctly after generation
- [ ] Analytics display accurate numbers
