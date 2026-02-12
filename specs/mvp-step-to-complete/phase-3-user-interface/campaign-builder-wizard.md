# Campaign Builder Wizard

## Purpose
A multi-step web interface for creating game campaigns. Users select a game template, customize theme/colors, configure game settings, and preview before generating. The wizard guides users through the creation process with validation at each step.

## User Stories

### P1 (Critical)
- US1: As a marketer, I want to select a game template type so that I can create the right kind of campaign
- US2: As a marketer, I want to customize colors and branding so that the game matches my brand
- US3: As a marketer, I want to configure game-specific settings (prizes, questions) so that the game meets my promotion goals

### P2 (Important)
- US4: As a marketer, I want to preview the game before generating so that I can verify it looks correct
- US5: As a marketer, I want to save draft campaigns so that I can continue working later
- US6: As a marketer, I want to duplicate an existing campaign so that I can create variations quickly

### P3 (Nice to Have)
- US7: As a marketer, I want AI-suggested copy and themes based on my brief so that I can get started faster
- US8: As a marketer, I want to upload my own assets (logo, images) so that I can use custom media

## Requirements

### Wizard Flow
- REQ1: Step 1: Template Selection - choose game type (spin wheel, scratch card, quiz, memory match)
- REQ2: Step 2: Theme Customization - colors, fonts, background, logo
- REQ3: Step 3: Game Configuration - template-specific settings (prizes, questions, etc.)
- REQ4: Step 4: Asset Selection - choose or generate images, audio, video
- REQ5: Step 5: Review & Generate - preview and trigger workflow

### Template Selection (Step 1)
- REQ6: Display template cards with preview image, title, description
- REQ7: Show template capabilities (supports audio, supports video, etc.)
- REQ8: Filter templates by category or search

### Theme Customization (Step 2)
- REQ9: Color picker for primary, secondary, accent colors
- REQ10: Font selection from preset font families
- REQ11: Background options: solid color, gradient, upload image
- REQ12: Logo upload with positioning options
- REQ13: Live preview of theme changes

### Game Configuration (Step 3)
- REQ14: Dynamic form based on selected template's config schema
- REQ15: Spin Wheel: segment editor (label, color, probability, prize)
- REQ16: Scratch Card: reveal content, scratch layer design
- REQ17: Quiz: question editor with correct answer marking
- REQ18: Memory Match: grid size, card pair configuration
- REQ19: Validation against template's config schema

### Asset Selection (Step 4)
- REQ20: List of asset slots required by template
- REQ21: Option to use AI-generated assets or upload custom
- REQ22: Preview uploaded/selected assets
- REQ23: Audio preview player

### Review & Generate (Step 5)
- REQ24: Full campaign summary
- REQ25: Interactive game preview (iframe)
- REQ26: Generate button triggers workflow run
- REQ27: Display estimated generation time

### State Management
- REQ28: Auto-save draft every 30 seconds
- REQ29: Persist wizard state in URL (deep linking to step)
- REQ30: Restore state from localStorage on page reload
- REQ31: Clear state on successful generation

### API Integration
```typescript
// Create campaign draft
POST /api/campaigns
Body: { name, template_id, config: Partial<CampaignConfig> }
Response: { campaign_id, status: 'draft' }

// Update campaign draft
PATCH /api/campaigns/{campaignId}
Body: { config: Partial<CampaignConfig> }

// Generate campaign (trigger workflow)
POST /api/campaigns/{campaignId}/generate
Response: { run_id, status: 'queued' }
```

## UI Components

### Vue Component Structure
```
/webapp/src/views/campaigns/
├── CampaignBuilderView.vue          # Main wizard container
├── components/
│   ├── WizardStepper.vue            # Step indicator
│   ├── TemplateSelector.vue         # Step 1
│   ├── ThemeCustomizer.vue          # Step 2
│   ├── GameConfigurator.vue         # Step 3 (dynamic)
│   │   ├── SpinWheelConfig.vue
│   │   ├── ScratchCardConfig.vue
│   │   ├── QuizConfig.vue
│   │   └── MemoryMatchConfig.vue
│   ├── AssetSelector.vue            # Step 4
│   ├── CampaignPreview.vue          # Step 5
│   └── GenerateButton.vue
```

### Pinia Store
```typescript
// stores/campaignBuilder.ts
interface CampaignBuilderState {
  currentStep: number;
  campaignId: string | null;
  templateId: string | null;
  theme: ThemeConfig;
  gameConfig: Record<string, unknown>;
  assets: AssetMapping[];
  isDirty: boolean;
  lastSavedAt: Date | null;
}
```

## Dependencies
- Depends on: Template System (template metadata), Run Engine API, Asset Storage (for uploads)
- Required by: Campaign Management (list/edit campaigns)

## Success Criteria
- [ ] All 4 game templates can be configured through the wizard
- [ ] Theme changes are reflected in live preview
- [ ] Draft campaigns persist across browser sessions
- [ ] Form validation prevents invalid configurations
- [ ] Generate button successfully triggers workflow
- [ ] Wizard is responsive on mobile devices
- [ ] Step navigation works (forward, backward, direct jump)
