# Theme Extraction

## Purpose
Automatically extract visual theme elements (colors, mood, style) from marketing briefs, brand assets, or reference images. Provides consistent brand-aligned theming for campaigns without manual color picking.

## User Stories

### P1 (Critical)
- US1: As a marketer, I want colors extracted from my brief so that the campaign matches my brand voice
- US2: As a marketer, I want to upload my logo and get matching colors so that the game is on-brand
- US3: As a marketer, I want theme presets suggested based on my industry so that I have good starting points

### P2 (Important)
- US4: As a marketer, I want to extract theme from a reference image (competitor, inspiration) so that I can match a specific look
- US5: As a marketer, I want contrast-checked color combinations so that text is readable
- US6: As a designer, I want the extracted palette to include primary, secondary, accent, and background colors

### P3 (Nice to Have)
- US7: As a marketer, I want theme variations (light mode, dark mode) generated automatically
- US8: As a designer, I want font pairing suggestions based on the mood

## Requirements

### Extraction Methods
- REQ1: Extract from text brief using LLM (mood → color mapping)
- REQ2: Extract from uploaded image using color analysis
- REQ3: Extract from URL (fetch page, analyze colors)
- REQ4: Suggest from industry/category presets

### Text-Based Extraction
- REQ5: Analyze brief for mood keywords (playful, urgent, premium, fun, professional)
- REQ6: Map mood to color palettes (e.g., "urgent" → red/orange, "premium" → gold/black)
- REQ7: Consider brand mentions for known brand colors
- REQ8: LLM generates color rationale

### Image-Based Extraction
- REQ9: Dominant color extraction (top 5 colors)
- REQ10: Color clustering to find palette
- REQ11: Identify logo vs background colors
- REQ12: Generate complementary colors for missing slots

### Theme Output Schema
```typescript
interface ExtractedTheme {
  primary_color: string;              // Hex, main brand color
  secondary_color: string;            // Hex, supporting color
  accent_color: string;               // Hex, highlights/CTAs
  background_color: string;           // Hex, background
  text_color: string;                 // Hex, primary text
  mood: ThemeMood;
  contrast_ratio: number;             // WCAG contrast score
  palette: string[];                  // Full extracted palette
  source: 'brief' | 'image' | 'url' | 'preset';
  confidence: number;                 // 0-1
}

type ThemeMood =
  | 'playful'      // Bright, fun colors
  | 'premium'      // Gold, black, elegant
  | 'urgent'       // Red, orange, high energy
  | 'professional' // Blue, gray, corporate
  | 'natural'      // Green, earth tones
  | 'festive'      // Multi-color, celebratory
  | 'minimal';     // Muted, clean

interface ThemePreset {
  id: string;
  name: string;
  industry: string;
  theme: ExtractedTheme;
  preview_image_url: string;
}
```

### Color Validation
- REQ13: Validate contrast ratio (WCAG AA: 4.5:1 for text)
- REQ14: Suggest adjustments if contrast fails
- REQ15: Warn if colors may cause accessibility issues

### Industry Presets
```typescript
const PRESETS = [
  { id: 'retail_sale', industry: 'Retail', mood: 'urgent' },
  { id: 'food_promo', industry: 'Food & Beverage', mood: 'playful' },
  { id: 'finance_reward', industry: 'Finance', mood: 'professional' },
  { id: 'holiday_festive', industry: 'Seasonal', mood: 'festive' },
  { id: 'luxury_brand', industry: 'Luxury', mood: 'premium' },
  // ... more presets
];
```

## API Integration

### Endpoints
```typescript
// Extract theme from brief
POST /api/themes/extract-from-brief
Body: { brief: string }
Response: ExtractedTheme

// Extract theme from image
POST /api/themes/extract-from-image
Body: { image: File } // multipart/form-data
Response: ExtractedTheme

// Extract theme from URL
POST /api/themes/extract-from-url
Body: { url: string }
Response: ExtractedTheme

// List theme presets
GET /api/themes/presets?industry=retail
Response: ThemePreset[]

// Validate theme contrast
POST /api/themes/validate
Body: ExtractedTheme
Response: { valid: boolean, issues: ContrastIssue[] }
```

### Skill Implementation (Text)
```yaml
skill_id: extract_theme_from_brief
version: "1.0.0"
title: "Extract Theme from Brief"
tags: [theme, llm, ai]

input_schema:
  type: object
  properties:
    brief: { type: string }
  required: [brief]

output_schema:
  $ref: "#/definitions/ExtractedTheme"

implementation:
  type: llm_call
  prompt_id: theme_extraction
```

### Image Processing
- Use sharp or jimp for image processing
- K-means clustering for dominant colors
- Consider using external API (e.g., Imagga, Google Vision) for complex analysis

## UI Integration

### In Campaign Builder (Step 2: Theme)
```
[Extract from Brief] [Upload Logo] [Browse Presets]
          ↓                ↓              ↓
    [Extracted Theme Preview]
          ↓
    [Color Pickers - editable]
```

## Dependencies
- Depends on: LiteLLM client (for LLM calls), Image processing library
- Required by: Campaign Builder (theme step), LLM Campaign Planning

## Success Criteria
- [ ] Brief extraction produces appropriate mood-based colors
- [ ] Image extraction identifies dominant brand colors
- [ ] Contrast validation catches low-contrast combinations
- [ ] Presets cover common industry use cases
- [ ] Extracted theme can be directly applied to campaign
- [ ] Processing time < 5 seconds for image analysis
