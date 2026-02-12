# Campaign Preview Player

## Purpose
A web-based viewer for playing and previewing generated campaigns. Supports standalone viewing, iframe embedding for third-party sites, and QR code sharing for mobile testing.

## User Stories

### P1 (Critical)
- US1: As a marketer, I want to preview my generated campaign so that I can verify it works correctly
- US2: As an end user, I want to play a campaign game in my browser so that I can participate in the promotion
- US3: As a marketer, I want to embed the campaign on my website so that customers can play without leaving my site

### P2 (Important)
- US4: As a marketer, I want to share a preview link with stakeholders so that they can review before launch
- US5: As a marketer, I want a QR code for the campaign so that I can test on mobile devices
- US6: As an end user, I want the game to load quickly so that I don't abandon before playing

### P3 (Nice to Have)
- US7: As a marketer, I want to see play statistics (views, completions, wins) so that I can measure engagement
- US8: As a developer, I want to customize player appearance (hide branding, custom loader) so that it fits client requirements

## Requirements

### Player Views
- REQ1: Standalone page: `/play/{campaignId}` - full-screen game experience
- REQ2: Embed mode: `/embed/{campaignId}` - minimal chrome for iframe
- REQ3: Preview mode: `/preview/{campaignId}` - with debug controls
- REQ4: Mobile-optimized viewport handling

### Standalone Player
- REQ5: Full-screen responsive game container
- REQ6: Loading screen with progress indicator
- REQ7: Error screen if campaign fails to load
- REQ8: Completion screen with CTA (claim prize, share, replay)
- REQ9: Optional branding header/footer

### Embed Mode
- REQ10: No navigation chrome, just the game
- REQ11: Responsive to parent container size
- REQ12: PostMessage API for parent communication
- REQ13: Allow parent to listen for game events (start, complete, win/lose)

### PostMessage Interface
```typescript
// Messages from game to parent
{ type: 'game_ready' }
{ type: 'game_started' }
{ type: 'game_complete', result: 'win' | 'lose', data: GameResult }

// Messages from parent to game
{ type: 'start_game' }
{ type: 'reset_game' }
{ type: 'set_theme', theme: ThemeOverrides }
```

### Preview Mode
- REQ14: Debug panel with campaign metadata
- REQ15: Reset game button
- REQ16: Device frame selector (iPhone, iPad, desktop)
- REQ17: QR code for mobile testing
- REQ18: Share link copy button

### Loading & Performance
- REQ19: Show loading progress (assets loaded / total)
- REQ20: Preload critical assets before showing game
- REQ21: Lazy load non-critical assets
- REQ22: Target: < 3s load time on 3G

### Security
- REQ23: Rate limit play attempts (prevent abuse)
- REQ24: Validate campaign exists and is published
- REQ25: CORS headers for embed mode
- REQ26: X-Frame-Options: ALLOWALL for embed, SAMEORIGIN for preview

### Share Features
- REQ27: Generate short URL for campaign
- REQ28: Generate QR code image (PNG)
- REQ29: Social share buttons (optional)
- REQ30: Copy link to clipboard

## Routes & API

### Frontend Routes
```
/play/:campaignId       - Standalone player
/embed/:campaignId      - Embeddable player
/preview/:campaignId    - Preview with debug tools
```

### API Endpoints
```typescript
// Get campaign for playing
GET /api/campaigns/{campaignId}/play
Response: {
  bundle_url: string;      // CDN URL to game bundle
  config: GameConfig;
  metadata: { name, template_id, created_at }
}

// Record play event (analytics)
POST /api/campaigns/{campaignId}/events
Body: { event: 'view' | 'start' | 'complete', data?: object }

// Generate short URL
POST /api/campaigns/{campaignId}/share
Response: { short_url, qr_code_url }
```

## Vue Component Structure
```
/webapp/src/views/player/
├── StandalonePlayerView.vue
├── EmbedPlayerView.vue
├── PreviewPlayerView.vue
├── components/
│   ├── GameContainer.vue      # Iframe wrapper for game bundle
│   ├── LoadingScreen.vue
│   ├── ErrorScreen.vue
│   ├── CompletionScreen.vue
│   ├── DebugPanel.vue
│   ├── DeviceFrameSelector.vue
│   └── ShareDialog.vue
```

## Dependencies
- Depends on: Campaign Management (to fetch campaign data), Asset Storage (CDN URLs), Game Templates (bundle format)
- Required by: Campaign Builder (preview step), Analytics dashboard

## Success Criteria
- [ ] Games load and play correctly in standalone mode
- [ ] Embed mode works in third-party iframes
- [ ] PostMessage communication works between game and parent
- [ ] Preview mode shows debug controls
- [ ] QR codes scan and open correct campaign
- [ ] Load time < 3s on 3G connection
- [ ] Works on iOS Safari, Android Chrome, desktop browsers
