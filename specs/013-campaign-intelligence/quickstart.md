# Quickstart: Campaign Intelligence

**Feature**: 013-campaign-intelligence
**Date**: 2026-02-16

## Prerequisites

- Docker compose running (PostgreSQL, Valkey, LiteLLM proxy)
- At least one LLM API key configured (`GEMINI_API_KEY` recommended)
- `pnpm install` completed
- Database migrations applied

## Test Scenarios

### Scenario 1: Generate Campaign Plan from Brief

**Endpoint**: `POST /api/intelligence/plan`

```bash
curl -X POST http://localhost:3001/api/intelligence/plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-token>" \
  -d '{
    "brief": "Summer sale for our clothing brand targeting millennials. We want a fun, engaging game that drives email signups. Budget is around $500 for prizes. Brand colors are teal and coral.",
    "constraints": {
      "template_preference": "spin_wheel",
      "budget_range": { "min": 300, "max": 500 },
      "target_audience": "millennials aged 25-35"
    }
  }'
```

**Expected Response** (200):
```json
{
  "generation_id": "uuid",
  "plan": {
    "summary": "A summer-themed spin wheel campaign...",
    "recommended_template": {
      "template_id": "spin_wheel",
      "template_name": "Spin Wheel",
      "reasoning": "Spin wheels have highest engagement for instant-win promotions...",
      "confidence": 0.92
    },
    "theme": {
      "primary_color": "#008B8B",
      "secondary_color": "#FF7F50",
      "accent_color": "#FFD700",
      "background_color": "#FFF8F0",
      "text_color": "#2D2D2D",
      "mood": "playful"
    },
    "prize_tiers": [
      { "tier": "grand", "suggestion": "$100 gift card", "probability": 0.05, "estimated_cost": "$100" },
      { "tier": "secondary", "suggestion": "20% off coupon", "probability": 0.20, "estimated_cost": "$50" },
      { "tier": "consolation", "suggestion": "Free shipping code", "probability": 0.75, "estimated_cost": "$0" }
    ],
    "estimated_engagement": "high",
    "asset_requirements": [
      { "type": "image", "purpose": "Campaign hero image" }
    ]
  },
  "duration_ms": 4200
}
```

### Scenario 2: Accept Plan and Create Campaign Draft

**Endpoint**: `POST /api/intelligence/plan/:generationId/accept`

```bash
curl -X POST http://localhost:3001/api/intelligence/plan/<generation-id>/accept \
  -H "Authorization: Bearer <clerk-token>" \
  -d '{
    "campaign_name": "Summer Spin & Win 2026"
  }'
```

**Expected Response** (201):
```json
{
  "campaign_id": "uuid",
  "campaign_name": "Summer Spin & Win 2026",
  "status": "draft",
  "template_id": "spin_wheel",
  "config": {
    "theme": {
      "primaryColor": "#008B8B",
      "secondaryColor": "#FF7F50",
      "accentColor": "#FFD700",
      "fontFamily": "Inter",
      "background": { "type": "solid", "value": "#FFF8F0" }
    },
    "game": {},
    "assets": []
  }
}
```

### Scenario 3: Generate Marketing Copy

**Endpoint**: `POST /api/intelligence/copy`

```bash
curl -X POST http://localhost:3001/api/intelligence/copy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-token>" \
  -d '{
    "campaign_id": "<campaign-uuid>",
    "campaign_context": {
      "template_type": "spin_wheel",
      "brand_name": "SummerStyle Co",
      "campaign_goal": "drive email signups",
      "target_audience": "millennials"
    },
    "copy_types": ["headline", "cta_button", "win_message", "lose_message"],
    "tone": "playful",
    "variations_count": 3
  }'
```

**Expected Response** (200):
```json
{
  "generation_id": "uuid",
  "copies": [
    {
      "copy_type": "headline",
      "variations": [
        { "text": "Spin Your Way to Summer Savings!", "character_count": 35, "tone_match_score": 0.95 },
        { "text": "Your Lucky Summer Spin Awaits", "character_count": 30, "tone_match_score": 0.88 },
        { "text": "Hot Deals, Cool Prizes - Spin Now!", "character_count": 35, "tone_match_score": 0.91 }
      ]
    },
    {
      "copy_type": "cta_button",
      "variations": [
        { "text": "Spin Now!", "character_count": 9, "tone_match_score": 0.97 },
        { "text": "Try Your Luck!", "character_count": 14, "tone_match_score": 0.92 },
        { "text": "Let's Go!", "character_count": 9, "tone_match_score": 0.85 }
      ]
    }
  ],
  "compliance_warnings": [],
  "duration_ms": 2800
}
```

### Scenario 4: Generate Copy with Compliance Warnings

```bash
curl -X POST http://localhost:3001/api/intelligence/copy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-token>" \
  -d '{
    "campaign_context": {
      "template_type": "scratch_card",
      "brand_name": "LuxeRewards",
      "campaign_goal": "drive purchases"
    },
    "copy_types": ["headline", "win_message"],
    "tone": "luxury",
    "variations_count": 3,
    "constraints": {
      "avoid_words": ["guaranteed", "free"]
    }
  }'
```

**Expected**: No variations contain "guaranteed" or "free". If LLM output contains flagged terms, compliance_warnings array is populated.

### Scenario 5: Extract Theme from Brief

**Endpoint**: `POST /api/intelligence/theme/from-brief`

```bash
curl -X POST http://localhost:3001/api/intelligence/theme/from-brief \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-token>" \
  -d '{
    "brief": "Premium watch brand launching a holiday giveaway. Elegant, sophisticated, gold and black aesthetic.",
    "campaign_id": "<campaign-uuid>"
  }'
```

**Expected Response** (200):
```json
{
  "generation_id": "uuid",
  "theme": {
    "primary_color": "#1A1A1A",
    "secondary_color": "#C9A84C",
    "accent_color": "#E8D48B",
    "background_color": "#0D0D0D",
    "text_color": "#F5F5F5",
    "mood": "premium",
    "confidence": 0.89,
    "palette": ["#1A1A1A", "#C9A84C", "#E8D48B", "#0D0D0D", "#F5F5F5", "#2C2C2C", "#8B7536", "#FFFFFF"],
    "source": "brief",
    "contrast_ratio": 14.2,
    "contrast_passes_aa": true,
    "accessibility_warnings": []
  },
  "duration_ms": 3100
}
```

### Scenario 6: Extract Theme from Image

**Endpoint**: `POST /api/intelligence/theme/from-image`

```bash
curl -X POST http://localhost:3001/api/intelligence/theme/from-image \
  -H "Authorization: Bearer <clerk-token>" \
  -F "image=@/path/to/brand-logo.png" \
  -F "campaign_id=<campaign-uuid>"
```

**Expected Response** (200):
```json
{
  "generation_id": "uuid",
  "theme": {
    "primary_color": "#2E86AB",
    "secondary_color": "#A23B72",
    "accent_color": "#F18F01",
    "background_color": "#F7F7F7",
    "text_color": "#1B1B1B",
    "mood": "professional",
    "confidence": 0.75,
    "palette": ["#2E86AB", "#A23B72", "#F18F01", "#F7F7F7", "#1B1B1B"],
    "source": "image",
    "contrast_ratio": 17.8,
    "contrast_passes_aa": true
  },
  "duration_ms": 1200
}
```

### Scenario 7: Browse Theme Presets

**Endpoint**: `GET /api/intelligence/theme/presets`

```bash
curl http://localhost:3001/api/intelligence/theme/presets?industry=retail \
  -H "Authorization: Bearer <clerk-token>"
```

**Expected Response** (200):
```json
{
  "presets": [
    {
      "id": "retail_sale",
      "name": "Retail Sale",
      "industry": "Retail",
      "mood": "urgent",
      "theme": {
        "primary_color": "#E63946",
        "secondary_color": "#F1FAEE",
        "accent_color": "#FFB703",
        "background_color": "#FFFFFF",
        "text_color": "#1D3557"
      }
    }
  ]
}
```

### Scenario 8: Get Generation History

**Endpoint**: `GET /api/intelligence/history`

```bash
curl "http://localhost:3001/api/intelligence/history?campaign_id=<uuid>&type=copy" \
  -H "Authorization: Bearer <clerk-token>"
```

**Expected Response** (200):
```json
{
  "generations": [
    {
      "id": "uuid",
      "generation_type": "copy",
      "status": "completed",
      "accepted": false,
      "duration_ms": 2800,
      "created_at": "2026-02-16T10:30:00Z"
    }
  ],
  "total": 1
}
```

### Scenario 9: Get Template-Specific Default Copy

**Endpoint**: `GET /api/intelligence/copy/defaults/:templateType`

```bash
curl http://localhost:3001/api/intelligence/copy/defaults/spin_wheel \
  -H "Authorization: Bearer <clerk-token>"
```

**Expected Response** (200):
```json
{
  "template_type": "spin_wheel",
  "defaults": {
    "cta_button": ["Spin Now!", "Try Your Luck!", "Spin to Win!"],
    "win_message": ["Congratulations!", "You're a Winner!", "Lucky Spin!"],
    "lose_message": ["So Close!", "Try Again!", "Better Luck Next Time!"]
  }
}
```

## Verification Checklist

- [ ] Plan generation returns valid structure with confidence scores
- [ ] Plan acceptance creates campaign draft with pre-filled config
- [ ] Copy respects character limits for each type
- [ ] Copy variations are distinct (no duplicates)
- [ ] Tone selection changes copy style noticeably
- [ ] Compliance warnings flag "guaranteed", "free" etc.
- [ ] Template defaults available as fallback
- [ ] Theme from brief returns valid hex colors
- [ ] Theme from image extracts dominant colors
- [ ] WCAG contrast ratio validated correctly
- [ ] Low-contrast themes generate accessibility warnings
- [ ] Theme presets filterable by industry
- [ ] Generation history persisted and queryable
- [ ] All endpoints respect tenant isolation
- [ ] Retry works when LLM returns malformed output
