# Memory Match Game Template

## Purpose
A card matching memory game where users flip cards to find matching pairs. Players must remember card positions and match all pairs within a time or move limit to win.

## User Stories

### P1 (Critical)
- US1: As a player, I want to tap cards to flip them over so that I can see what's underneath
- US2: As a player, I want matching pairs to stay revealed so that I can see my progress
- US3: As a campaign creator, I want to configure the cards (images, number of pairs) so that the game matches my campaign

### P2 (Important)
- US4: As a player, I want a move counter or timer so that I have a goal to beat
- US5: As a player, I want smooth card flip animations so that the game feels polished
- US6: As a campaign creator, I want to set win conditions (max moves, time limit) so that I can control difficulty

### P3 (Nice to Have)
- US7: As a player, I want a hint button that briefly shows all cards so that I can get unstuck
- US8: As a campaign creator, I want difficulty levels (easy/medium/hard with different grid sizes)

## Requirements

### Game Mechanics
- REQ1: Grid of face-down cards (configurable: 2x3, 3x4, 4x4, 4x5)
- REQ2: Tap to flip a card face-up
- REQ3: Two cards flipped: if match, stay revealed; if no match, flip back after 1s delay
- REQ4: Game ends when all pairs matched (win) or limit exceeded (lose)
- REQ5: Prevent flipping more than 2 cards simultaneously

### Card Display
- REQ6: Card back shows uniform design (configurable color/image)
- REQ7: Card front shows unique image per pair
- REQ8: Card flip animation: 3D rotate effect (CSS transform)
- REQ9: Matched pairs have visual indicator (glow, checkmark)

### Win Conditions
- REQ10: Move limit mode: win if all pairs matched in X moves
- REQ11: Time limit mode: win if all pairs matched in X seconds
- REQ12: Free mode: no limit, track score for leaderboard

### Configuration Schema
```typescript
interface MemoryMatchConfig {
  grid_size: GridSize;               // '2x3' | '3x4' | '4x4' | '4x5'
  card_pairs: CardPair[];            // Must match grid size / 2
  card_back: CardBackConfig;
  win_condition: WinConditionConfig;
  flip_delay_ms: number;             // Time before non-matching cards flip back
  theme: ThemeConfig;
}

type GridSize = '2x3' | '3x4' | '4x4' | '4x5';

interface CardPair {
  pair_id: string;                   // Unique identifier
  image_url: string;                 // Image shown on card front
  label?: string;                    // Optional text label
}

interface CardBackConfig {
  type: 'color' | 'image';
  color?: string;
  image_url?: string;
  pattern?: 'solid' | 'striped' | 'dotted';
}

interface WinConditionConfig {
  type: 'moves' | 'time' | 'none';
  limit?: number;                    // Max moves or seconds
  prize_tiers?: PrizeTier[];         // Different prizes for different scores
}

interface PrizeTier {
  max_moves?: number;                // Win with <= this many moves
  max_time_sec?: number;             // Win within this time
  prize_label: string;
  prize_code?: string;
  is_winner: boolean;
}

interface ThemeConfig {
  primary_color: string;
  matched_color: string;             // Glow color for matched pairs
  background_color: string;
  font_family: string;
}
```

### Asset Slots
| Slot ID | Type | Required | Description |
|---------|------|----------|-------------|
| background_image | image | No | Full-screen background |
| card_back_image | image | No | Image for card backs |
| card_image_1 through card_image_10 | image | No | Images for card fronts |
| logo | image | No | Brand logo |
| bgm_track | audio | No | Background music |
| flip_sound | audio | No | Card flip sound |
| match_sound | audio | No | Sound when pair matched |
| no_match_sound | audio | No | Sound when no match |
| win_sound | audio | Yes | Victory sound |
| lose_sound | audio | No | Time/move limit exceeded |

### Grid Calculations
| Grid Size | Cards | Pairs | Minimum Moves |
|-----------|-------|-------|---------------|
| 2x3 | 6 | 3 | 3 |
| 3x4 | 12 | 6 | 6 |
| 4x4 | 16 | 8 | 8 |
| 4x5 | 20 | 10 | 10 |

### Responsive Behavior
- REQ13: Grid scales to fit viewport with equal card sizes
- REQ14: Minimum card size: 60px for touch accuracy
- REQ15: Cards maintain aspect ratio (square or custom)

### Outcome Handling
- REQ16: Emit `gameComplete` event when finished
- REQ17: Event payload: `{ won: boolean, moves: number, timeMs: number, prizeTier?: PrizeTier }`
- REQ18: Results screen shows moves, time, and prize

## Technical Implementation
- Framework: Vanilla JS + CSS Grid for layout
- Animation: CSS 3D transforms for card flip
- State: Track flipped cards, matched pairs, move count
- Shuffle: Fisher-Yates algorithm for card placement

## Dependencies
- Depends on: Template System (manifest, config injection, asset slots)
- Required by: bundle_game_template skill when template_id = "memory_match"

## Success Criteria
- [ ] Cards flip with smooth 3D animation
- [ ] Matching pairs detection works correctly
- [ ] Non-matching pairs flip back after delay
- [ ] Move counter increments correctly
- [ ] Timer counts accurately
- [ ] Win/lose conditions trigger at correct thresholds
- [ ] Grid layouts work for all supported sizes
- [ ] Works offline after initial load
- [ ] Touch-friendly on mobile devices
