import type { ThemeMood } from '@agentic-template/dto/src/intelligence/intelligence-enums';

export interface ThemePreset {
  id: string;
  name: string;
  industry: string;
  mood: ThemeMood;
  theme: {
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'retail-sale',
    name: 'Retail Sale',
    industry: 'retail',
    mood: 'urgent',
    theme: {
      primary_color: '#E53E3E',
      secondary_color: '#FFFFFF',
      accent_color: '#F6E05E',
      background_color: '#FFFFFF',
      text_color: '#1A202C',
    },
  },
  {
    id: 'retail-loyalty',
    name: 'Retail Loyalty',
    industry: 'retail',
    mood: 'natural',
    theme: {
      primary_color: '#319795',
      secondary_color: '#EDD9B4',
      accent_color: '#D69E2E',
      background_color: '#FFFFFF',
      text_color: '#4A5568',
    },
  },
  {
    id: 'food-beverage',
    name: 'Food & Beverage',
    industry: 'food',
    mood: 'playful',
    theme: {
      primary_color: '#ED8936',
      secondary_color: '#48BB78',
      accent_color: '#F6E05E',
      background_color: '#FFFAF0',
      text_color: '#3E2723',
    },
  },
  {
    id: 'finance-trust',
    name: 'Finance Trust',
    industry: 'finance',
    mood: 'professional',
    theme: {
      primary_color: '#1A365D',
      secondary_color: '#E2E8F0',
      accent_color: '#3182CE',
      background_color: '#FFFFFF',
      text_color: '#2D3748',
    },
  },
  {
    id: 'finance-premium',
    name: 'Finance Premium',
    industry: 'finance',
    mood: 'premium',
    theme: {
      primary_color: '#D69E2E',
      secondary_color: '#000000',
      accent_color: '#B7791F',
      background_color: '#FFFFF0',
      text_color: '#1A1A1A',
    },
  },
  {
    id: 'holiday-festive',
    name: 'Holiday Festive',
    industry: 'holiday',
    mood: 'festive',
    theme: {
      primary_color: '#C53030',
      secondary_color: '#276749',
      accent_color: '#D69E2E',
      background_color: '#FFFAFA',
      text_color: '#22543D',
    },
  },
  {
    id: 'holiday-winter',
    name: 'Holiday Winter',
    industry: 'holiday',
    mood: 'minimal',
    theme: {
      primary_color: '#63B3ED',
      secondary_color: '#C0C0C0',
      accent_color: '#FFFFFF',
      background_color: '#EDF2F7',
      text_color: '#1A365D',
    },
  },
  {
    id: 'luxury-gold',
    name: 'Luxury Gold',
    industry: 'luxury',
    mood: 'premium',
    theme: {
      primary_color: '#D69E2E',
      secondary_color: '#000000',
      accent_color: '#D4AF7A',
      background_color: '#FFFFF0',
      text_color: '#1A1A1A',
    },
  },
  {
    id: 'technology-modern',
    name: 'Technology Modern',
    industry: 'technology',
    mood: 'professional',
    theme: {
      primary_color: '#3182CE',
      secondary_color: '#BEE3F8',
      accent_color: '#0BC5EA',
      background_color: '#FFFFFF',
      text_color: '#2D3748',
    },
  },
  {
    id: 'technology-startup',
    name: 'Technology Startup',
    industry: 'technology',
    mood: 'playful',
    theme: {
      primary_color: '#805AD5',
      secondary_color: '#FC8181',
      accent_color: '#F6E05E',
      background_color: '#FFFFFF',
      text_color: '#44337A',
    },
  },
];

export function getThemePresets(industry?: string, mood?: string): ThemePreset[] {
  return THEME_PRESETS.filter((preset) => {
    if (industry && preset.industry.toLowerCase() !== industry.toLowerCase()) {
      return false;
    }
    if (mood && preset.mood.toLowerCase() !== mood.toLowerCase()) {
      return false;
    }
    return true;
  });
}
