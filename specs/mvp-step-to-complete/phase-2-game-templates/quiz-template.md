# Quiz Game Template

## Purpose
A trivia/quiz game where users answer multiple-choice questions to win prizes. Questions are presented one at a time with optional timer, and the final score determines the outcome.

## User Stories

### P1 (Critical)
- US1: As a player, I want to see a question with multiple answer options so that I can make my choice
- US2: As a player, I want immediate feedback on whether my answer was correct so that I know how I'm doing
- US3: As a campaign creator, I want to configure questions, answers, and winning threshold so that I can create custom quizzes

### P2 (Important)
- US4: As a player, I want a timer for each question so that the game has urgency
- US5: As a player, I want to see my progress (question X of Y) so that I know how much is left
- US6: As a campaign creator, I want to set different prizes for different score ranges so that partial success is rewarded

### P3 (Nice to Have)
- US7: As a player, I want explanations for wrong answers so that I learn something
- US8: As a campaign creator, I want to randomize question order so that the quiz is harder to share answers

## Requirements

### Quiz Mechanics
- REQ1: Display one question at a time with 2-4 answer options
- REQ2: Single selection - tapping an answer submits it immediately (or tap + confirm button)
- REQ3: Correct/incorrect feedback shown before advancing to next question
- REQ4: Optional timer per question (default: no timer, configurable 10-60 seconds)
- REQ5: Final score calculated as correct answers / total questions

### Visual Feedback
- REQ6: Correct answer: green highlight, checkmark, positive sound
- REQ7: Wrong answer: red highlight, show correct answer, negative sound
- REQ8: Timer visual: circular countdown or progress bar
- REQ9: Question transition animation (slide or fade)

### Configuration Schema
```typescript
interface QuizConfig {
  questions: QuizQuestion[];
  time_per_question_sec?: number;    // null = no timer
  passing_score: number;             // 0-100 percentage
  show_correct_answer: boolean;      // Show correct after wrong
  randomize_questions: boolean;
  randomize_answers: boolean;
  prize_tiers: PrizeTier[];
  theme: ThemeConfig;
}

interface QuizQuestion {
  question_text: string;
  question_image_url?: string;       // Optional image with question
  answers: QuizAnswer[];
  explanation?: string;              // Shown after answering
}

interface QuizAnswer {
  text: string;
  is_correct: boolean;
}

interface PrizeTier {
  min_score: number;                 // Minimum percentage to qualify
  max_score: number;                 // Maximum percentage
  prize_label: string;               // "Grand Prize", "Consolation"
  prize_code?: string;
  is_winner: boolean;
}

interface ThemeConfig {
  primary_color: string;
  correct_color: string;             // default: green
  wrong_color: string;               // default: red
  background_color: string;
  font_family: string;
}
```

### Asset Slots
| Slot ID | Type | Required | Description |
|---------|------|----------|-------------|
| background_image | image | No | Full-screen background |
| logo | image | No | Brand logo |
| bgm_track | audio | No | Background music |
| correct_sound | audio | No | Sound for correct answer |
| wrong_sound | audio | No | Sound for wrong answer |
| tick_sound | audio | No | Timer tick sound |
| win_sound | audio | Yes | Final win sound |
| lose_sound | audio | No | Final lose sound |

### Progress & Scoring
- REQ10: Show progress indicator: "Question 3 of 10"
- REQ11: Optionally show running score during quiz
- REQ12: Final results screen shows: score, time taken, prize won

### Responsive Behavior
- REQ13: Question text scales for readability (min 16px)
- REQ14: Answer buttons are touch-friendly (min 44px height)
- REQ15: Timer visible without scrolling

### Outcome Handling
- REQ16: Emit `gameComplete` event with results
- REQ17: Event payload: `{ score: number, totalQuestions: number, timeMs: number, prizeTier: PrizeTier }`
- REQ18: Display results screen with score, prize, and CTA

## Technical Implementation
- Framework: Vanilla JS + DOM manipulation
- Transitions: CSS transitions for smooth animations
- Timer: setInterval with visual sync via requestAnimationFrame
- State management: Simple state machine (showing_question, showing_feedback, results)

## Dependencies
- Depends on: Template System (manifest, config injection, asset slots)
- Required by: bundle_game_template skill when template_id = "quiz"

## Success Criteria
- [ ] Questions display correctly with all answer options
- [ ] Correct/wrong feedback is immediate and clear
- [ ] Timer counts down accurately and triggers timeout
- [ ] Score calculation matches expected results
- [ ] Prize tier assignment works based on score ranges
- [ ] Works offline after initial load
- [ ] Accessible: keyboard navigation, screen reader compatible
