# Scratch Card Game Template

## Purpose
A digital scratch card game where users scratch to reveal a hidden prize. The card displays a scratchable layer that reveals the outcome underneath through touch/mouse interaction.

## User Stories

### P1 (Critical)
- US1: As a player, I want to scratch the card surface to reveal what's underneath so that I can discover my prize
- US2: As a player, I want realistic scratch particle effects so that the experience feels tactile
- US3: As a campaign creator, I want to configure the prize and reveal image so that the game matches my promotion

### P2 (Important)
- US4: As a player, I want the result to auto-reveal after scratching a certain percentage so that I don't have to scratch everything
- US5: As a campaign creator, I want to customize the scratch layer appearance (color, pattern, texture) so that it matches my brand
- US6: As a player, I want audio feedback (scratch sound, reveal sound) so that the experience is immersive

### P3 (Nice to Have)
- US7: As a player, I want to see scratch particles fall as I scratch so that the effect is more realistic
- US8: As a campaign creator, I want multiple scratch zones with different prizes so that I can create more complex games

## Requirements

### Scratch Mechanics
- REQ1: Scratch layer covers reveal layer completely at start
- REQ2: Touch/mouse drag removes scratch layer in brush stroke pattern
- REQ3: Brush size configurable (default: 40px diameter)
- REQ4: Scratch effect uses eraser/destination-out composite operation
- REQ5: Auto-reveal triggers when X% scratched (configurable, default: 60%)

### Visual Effects
- REQ6: Scratch layer can be solid color, gradient, or image texture
- REQ7: Sparkle/particle effect along scratch path
- REQ8: Reveal animation (fade-in or zoom) when auto-reveal triggers
- REQ9: Win celebration: confetti, glow
- REQ10: Lose effect: subtle shake or fade

### Configuration Schema
```typescript
interface ScratchCardConfig {
  scratch_layer: ScratchLayerConfig;
  reveal_content: RevealContentConfig;
  auto_reveal_threshold: number;     // 0-100, percentage
  brush_size: number;                // pixels
  theme: ThemeConfig;
}

interface ScratchLayerConfig {
  type: 'color' | 'gradient' | 'image';
  color?: string;                    // Hex color if type='color'
  gradient?: GradientConfig;         // If type='gradient'
  image_url?: string;                // If type='image'
  pattern?: 'none' | 'dots' | 'lines'; // Overlay pattern
}

interface RevealContentConfig {
  type: 'text' | 'image' | 'both';
  text?: string;                     // "YOU WIN!" or "Try Again"
  image_url?: string;                // Prize image
  is_winner: boolean;
  prize_code?: string;
}

interface ThemeConfig {
  primary_color: string;
  background_color: string;
  font_family: string;
}
```

### Asset Slots
| Slot ID | Type | Required | Description |
|---------|------|----------|-------------|
| background_image | image | No | Full-screen background |
| scratch_texture | image | No | Texture for scratch layer |
| reveal_image | image | No | Image shown when revealed |
| logo | image | No | Brand logo |
| bgm_track | audio | No | Background music |
| scratch_sound | audio | No | Sound while scratching |
| reveal_sound | audio | Yes | Sound when prize revealed |
| win_sound | audio | No | Additional win celebration |

### Responsive Behavior
- REQ11: Scratch card scales to fit viewport (min 280px, max 500px width)
- REQ12: Touch-optimized for finger scratching
- REQ13: Mouse cursor changes to scratch tool icon

### Performance
- REQ14: Canvas-based rendering for smooth scratch effect
- REQ15: Offscreen canvas for scratch layer to prevent flicker
- REQ16: Throttle scratch calculations to 60fps max

### Outcome Handling
- REQ17: Emit `gameComplete` event when auto-reveal triggers
- REQ18: Event payload: `{ won: boolean, percentScratched: number, prize_code?: string }`
- REQ19: Display result overlay with CTA buttons

## Technical Implementation
- Framework: Vanilla JS + Canvas API
- Scratch effect: globalCompositeOperation = 'destination-out'
- Touch: TouchEvent and PointerEvent for cross-device support
- Performance: Use requestAnimationFrame, limit re-renders

## Dependencies
- Depends on: Template System (manifest, config injection, asset slots)
- Required by: bundle_game_template skill when template_id = "scratch_card"

## Success Criteria
- [ ] Scratch layer reveals underlying content smoothly
- [ ] Auto-reveal triggers at configured threshold
- [ ] Scratch effect works on touch devices without lag
- [ ] Particle effects render without performance issues
- [ ] Audio plays on user interaction (scratch start)
- [ ] Works offline after initial load
- [ ] Load time < 2s on 3G connection
