import type { CopyType } from '@agentic-template/dto/src/intelligence/intelligence-enums';

export const COPY_CHARACTER_LIMITS: Record<CopyType, number> = {
  headline: 60,
  subheadline: 120,
  cta_button: 20,
  prize_description: 100,
  win_message: 80,
  lose_message: 80,
  instructions: 200,
  terms_summary: 300,
};
