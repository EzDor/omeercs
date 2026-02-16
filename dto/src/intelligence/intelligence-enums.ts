export const CopyType = {
  HEADLINE: 'headline',
  SUBHEADLINE: 'subheadline',
  CTA_BUTTON: 'cta_button',
  PRIZE_DESCRIPTION: 'prize_description',
  WIN_MESSAGE: 'win_message',
  LOSE_MESSAGE: 'lose_message',
  INSTRUCTIONS: 'instructions',
  TERMS_SUMMARY: 'terms_summary',
} as const;

export type CopyType = (typeof CopyType)[keyof typeof CopyType];

export const CopyTone = {
  PLAYFUL: 'playful',
  URGENT: 'urgent',
  PROFESSIONAL: 'professional',
  LUXURY: 'luxury',
  FRIENDLY: 'friendly',
} as const;

export type CopyTone = (typeof CopyTone)[keyof typeof CopyTone];

export const ThemeMood = {
  PLAYFUL: 'playful',
  PREMIUM: 'premium',
  URGENT: 'urgent',
  PROFESSIONAL: 'professional',
  NATURAL: 'natural',
  FESTIVE: 'festive',
  MINIMAL: 'minimal',
} as const;

export type ThemeMood = (typeof ThemeMood)[keyof typeof ThemeMood];

export const GenerationType = {
  PLAN: 'plan',
  COPY: 'copy',
  THEME_BRIEF: 'theme_brief',
  THEME_IMAGE: 'theme_image',
} as const;

export type GenerationType = (typeof GenerationType)[keyof typeof GenerationType];

export const GenerationStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type GenerationStatus = (typeof GenerationStatus)[keyof typeof GenerationStatus];

export const COPY_TYPE_VALUES: CopyType[] = Object.values(CopyType);
export const COPY_TONE_VALUES: CopyTone[] = Object.values(CopyTone);
export const THEME_MOOD_VALUES: ThemeMood[] = Object.values(ThemeMood);
export const GENERATION_TYPE_VALUES: GenerationType[] = Object.values(GenerationType);
export const GENERATION_STATUS_VALUES: GenerationStatus[] = Object.values(GenerationStatus);
