# Spin Wheel Game Template

## Purpose
A prize wheel game where users spin to win prizes. The wheel displays configurable segments with prizes/outcomes, spins with physics-based animation, and reveals the result.

## User Stories

### P1 (Critical)
- US1: As a player, I want to tap/click to spin the wheel so that I can participate in the game
- US2: As a player, I want to see the wheel animate with realistic physics so that the experience feels exciting
- US3: As a campaign creator, I want to configure wheel segments (prizes, colors, probabilities) so that the game matches my promotion

### P2 (Important)
- US4: As a player, I want to see a clear win/lose outcome with celebration animation so that I know my result
- US5: As a campaign creator, I want to set the spin duration and easing so that I can control the pacing
- US6: As a player, I want audio feedback (spin sound, win/lose sound) so that the experience is immersive

### P3 (Nice to Have)
- US7: As a campaign creator, I want a "spin again" option for non-winning outcomes so that users stay engaged
- US8: As a player, I want haptic feedback on mobile when the wheel stops so that the result feels impactful

## Requirements

### Wheel Mechanics
- REQ1: Wheel displays 4-12 segments with configurable labels, colors, and icons
- REQ2: Spin triggered by tap/click on wheel or dedicated "SPIN" button
- REQ3: Wheel rotation uses easing function (ease-out cubic) for realistic deceleration
- REQ4: Final position determined by weighted random selection of segments
- REQ5: Pointer/indicator shows winning segment at top

### Animation
- REQ6: Spin duration configurable (default: 5 seconds)
- REQ7: Minimum 3 full rotations before stopping
- REQ8: Tick sound plays as each segment passes the pointer
- REQ9: Win animation: confetti, glow effect on winning segment
- REQ10: Lose animation: subtle effect, consolation message

### Configuration Schema
```typescript
interface SpinWheelConfig {
  wheel_segments: WheelSegment[];
  spin_duration_ms: number;          // 3000-10000
  pointer_position: 'top' | 'right'; // default: 'top'
  allow_respin: boolean;             // default: false
  theme: ThemeConfig;
}

interface WheelSegment {
  label: string;                     // "50% OFF", "Try Again"
  color: string;                     // Hex color
  icon_url?: string;                 // Optional icon
  probability: number;               // 0-100, must sum to 100
  is_winner: boolean;                // Determines outcome animation
  prize_code?: string;               // For backend redemption
}

interface ThemeConfig {
  primary_color: string;
  secondary_color: string;
  background_image_url?: string;
  font_family: string;
}
```

### Asset Slots
| Slot ID | Type | Required | Description |
|---------|------|----------|-------------|
| background_image | image | No | Full-screen background |
| logo | image | No | Brand logo (top of screen) |
| bgm_track | audio | No | Background music loop |
| spin_sound | audio | No | Sound during spin |
| tick_sound | audio | No | Sound as segments pass pointer |
| win_sound | audio | Yes | Celebration sound |
| lose_sound | audio | No | Consolation sound |

### Responsive Behavior
- REQ11: Wheel scales to fit viewport (min 280px, max 600px diameter)
- REQ12: Touch-friendly tap targets (min 44px)
- REQ13: Portrait and landscape orientation support

### Outcome Handling
- REQ14: Emit `gameComplete` event with result: `{ won: boolean, segment: WheelSegment }`
- REQ15: Display result screen with prize details (if won) or consolation message
- REQ16: Optional CTA button ("Claim Prize", "Share", "Play Again")

## Technical Implementation
- Framework: Vanilla JS + Canvas API (no dependencies)
- Animation: requestAnimationFrame for smooth 60fps
- Audio: Web Audio API with fallback to HTMLAudioElement
- Touch: Pointer Events API for unified mouse/touch

## Dependencies
- Depends on: Template System (manifest, config injection, asset slots)
- Required by: bundle_game_template skill when template_id = "spin_wheel"

## Success Criteria
- [ ] Wheel renders with all configured segments
- [ ] Spin animation is smooth (60fps on mid-range devices)
- [ ] Winning segment matches weighted probability over 1000 spins (within 5% tolerance)
- [ ] Audio plays correctly on mobile (after user interaction)
- [ ] Win/lose outcomes trigger correct animations
- [ ] Works offline after initial load
- [ ] Load time < 2s on 3G connection
