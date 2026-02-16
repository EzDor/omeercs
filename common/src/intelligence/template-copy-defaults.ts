export interface TemplateCopyDefaults {
  cta_button: string[];
  win_message: string[];
  lose_message: string[];
}

export const TEMPLATE_COPY_DEFAULTS: Record<string, TemplateCopyDefaults> = {
  spin_wheel: {
    cta_button: ['Spin Now!', 'Try Your Luck!', 'Spin to Win!'],
    win_message: ['Congratulations!', "You're a Winner!", 'Lucky Spin!'],
    lose_message: ['So Close!', 'Try Again!', 'Better Luck Next Time!'],
  },
  scratch_card: {
    cta_button: ['Scratch to Reveal!', 'Uncover Your Prize!', 'Start Scratching!'],
    win_message: ['You Won!', 'Amazing Prize!', 'Winner Winner!'],
    lose_message: ['Not This Time!', 'Try Again Soon!', 'Almost There!'],
  },
  quiz: {
    cta_button: ['Test Your Knowledge!', 'Play Now!', 'Start the Quiz!'],
    win_message: ['Genius!', 'Perfect Score!', 'You Nailed It!'],
    lose_message: ['Nice Try!', 'Study Up!', 'Almost Had It!'],
  },
  memory_match: {
    cta_button: ['Start Matching!', 'Find the Pairs!', 'Play Now!'],
    win_message: ['Great Memory!', 'You Found Them All!', 'Perfect Match!'],
    lose_message: ["Time's Up!", 'Try Again!', 'So Close!'],
  },
};

export function getTemplateCopyDefaults(templateType: string): TemplateCopyDefaults | undefined {
  return TEMPLATE_COPY_DEFAULTS[templateType];
}
