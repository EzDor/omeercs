# Copy Generation

## Purpose
Generate marketing copy for campaigns using LLM: headlines, button text, prize descriptions, win/lose messages, and promotional text. Ensures consistent, engaging messaging that matches the campaign's tone and goals.

## User Stories

### P1 (Critical)
- US1: As a marketer, I want AI-generated headlines for my campaign so that I have compelling entry points
- US2: As a marketer, I want prize descriptions written for me so that they sound enticing
- US3: As a marketer, I want win/lose messages generated so that player feedback is on-brand

### P2 (Important)
- US4: As a marketer, I want multiple copy variations to choose from so that I can A/B test
- US5: As a marketer, I want copy in different tones (playful, urgent, professional) so that I can match my brand
- US6: As a marketer, I want character limits respected so that copy fits the UI

### P3 (Nice to Have)
- US7: As a marketer, I want copy translated to other languages so that I can run international campaigns
- US8: As a marketer, I want copy checked for compliance (no misleading claims) so that I avoid legal issues

## Requirements

### Copy Types
- REQ1: Headlines (campaign title, entry screen)
- REQ2: Subheadlines (supporting text)
- REQ3: Button text (CTA: "Spin Now!", "Scratch to Win!", "Start Quiz")
- REQ4: Prize descriptions (for each prize tier)
- REQ5: Win messages ("Congratulations!", "You won X!")
- REQ6: Lose messages ("Better luck next time", "Try again tomorrow")
- REQ7: Instructions (how to play)
- REQ8: Terms & conditions summary

### Copy Context Input
```typescript
interface CopyGenerationRequest {
  campaign_context: {
    template_type: string;            // "spin_wheel", "scratch_card", etc.
    brand_name?: string;
    product_name?: string;
    campaign_goal?: string;           // "drive sales", "collect emails", etc.
    target_audience?: string;
  };
  copy_types: CopyType[];             // Which copy to generate
  tone: CopyTone;
  constraints?: {
    max_headline_length?: number;     // characters
    max_description_length?: number;
    avoid_words?: string[];           // Compliance
    required_words?: string[];        // Brand terms
  };
  language?: string;                  // ISO code, default "en"
  variations_count?: number;          // 1-5, default 3
}

type CopyType =
  | 'headline'
  | 'subheadline'
  | 'cta_button'
  | 'prize_description'
  | 'win_message'
  | 'lose_message'
  | 'instructions'
  | 'terms_summary';

type CopyTone =
  | 'playful'       // Fun, casual, emoji-friendly
  | 'urgent'        // Time-limited, action-oriented
  | 'professional'  // Corporate, trustworthy
  | 'luxury'        // Exclusive, premium
  | 'friendly';     // Warm, approachable
```

### Copy Output Schema
```typescript
interface GeneratedCopy {
  copy_type: CopyType;
  variations: CopyVariation[];
}

interface CopyVariation {
  text: string;
  character_count: number;
  tone_match_score: number;           // 0-1, how well it matches requested tone
  notes?: string;                     // AI explanation for this variation
}

interface CopyGenerationResponse {
  copies: GeneratedCopy[];
  language: string;
  generated_at: string;
}
```

### Template-Specific Defaults
```typescript
const TEMPLATE_COPY_DEFAULTS = {
  spin_wheel: {
    cta_button: ["Spin Now!", "Try Your Luck!", "Spin to Win!"],
    win_message: ["🎉 Congratulations!", "You're a Winner!", "Lucky Spin!"],
    lose_message: ["So Close!", "Try Again!", "Better Luck Next Time!"],
  },
  scratch_card: {
    cta_button: ["Scratch to Reveal!", "Uncover Your Prize!", "Start Scratching!"],
    win_message: ["You Found It!", "Winner!", "Prize Revealed!"],
    lose_message: ["Not This Time", "Keep Trying!", "Scratch Again Soon!"],
  },
  quiz: {
    cta_button: ["Start Quiz!", "Test Your Knowledge!", "Begin!"],
    win_message: ["Quiz Champion!", "Perfect Score!", "You Nailed It!"],
    lose_message: ["Good Try!", "Learn More, Try Again!", "Almost There!"],
  },
  memory_match: {
    cta_button: ["Play Now!", "Start Matching!", "Test Your Memory!"],
    win_message: ["Memory Master!", "All Matched!", "Perfect!"],
    lose_message: ["Time's Up!", "Keep Practicing!", "Try Again!"],
  },
};
```

### Character Limits by Context
| Copy Type | Default Max | Notes |
|-----------|-------------|-------|
| headline | 60 | Above fold, large text |
| subheadline | 120 | Supporting, smaller |
| cta_button | 20 | Must fit button |
| prize_description | 100 | Per prize |
| win_message | 80 | Celebration overlay |
| lose_message | 80 | Consolation overlay |
| instructions | 200 | How to play |

### Compliance Checks
- REQ9: Flag potentially misleading claims ("guaranteed", "free" without context)
- REQ10: Warn about regulatory words ("winner", "prize" may need T&C)
- REQ11: Check character limits
- REQ12: Optional profanity filter

## API Integration

### Endpoint
```typescript
// Generate copy
POST /api/copy/generate
Body: CopyGenerationRequest
Response: CopyGenerationResponse

// Get template defaults
GET /api/copy/defaults/{templateType}
Response: { defaults: TemplateCopyDefaults }

// Translate copy
POST /api/copy/translate
Body: { texts: string[], source_lang: string, target_lang: string }
Response: { translations: string[] }
```

### Skill Implementation
```yaml
skill_id: generate_campaign_copy
version: "1.0.0"
title: "Generate Campaign Copy"
tags: [copy, llm, ai, marketing]

input_schema:
  $ref: "#/definitions/CopyGenerationRequest"

output_schema:
  $ref: "#/definitions/CopyGenerationResponse"

implementation:
  type: llm_call
  prompt_id: campaign_copy_generation
```

## Prompt Template (Example)

```markdown
---
prompt_id: campaign_copy_generation
version: 1.0.0
model_defaults:
  model: gemini-2.5-flash
  temperature: 0.8
---

You are a marketing copywriter specializing in promotional game campaigns.

Generate copy for a {template_type} campaign:
- Brand: {brand_name}
- Product: {product_name}
- Goal: {campaign_goal}
- Audience: {target_audience}
- Tone: {tone}

Generate {variations_count} variations for each requested copy type.
Respect character limits. Be creative but stay on-brand.

Copy types needed: {copy_types}
```

## UI Integration

### In Campaign Builder (Step 3: Configuration)
```
[Headline] [____________] [✨ Generate]
                           ↓
           [Variation 1] [Variation 2] [Variation 3]
                Select one or edit
```

## Dependencies
- Depends on: LiteLLM client, Prompt Registry
- Required by: Campaign Builder (all configuration steps), LLM Campaign Planning

## Success Criteria
- [ ] Generated copy matches requested tone
- [ ] Character limits are respected
- [ ] Multiple variations are distinct, not repetitive
- [ ] Template-specific defaults are appropriate
- [ ] Compliance warnings flag risky words
- [ ] Copy can be directly inserted into campaign config
- [ ] Generation time < 5 seconds for full copy set
