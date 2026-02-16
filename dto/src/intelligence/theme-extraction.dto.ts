import { IsString, IsOptional, IsUUID, MinLength, MaxLength, Matches } from 'class-validator';
import type { ThemeMood } from './intelligence-enums';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export class ExtractThemeFromBriefRequest {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  brief: string;

  @IsOptional()
  @IsUUID()
  campaign_id?: string;
}

export class ValidateThemeRequest {
  @IsString()
  @Matches(HEX_COLOR_PATTERN)
  primary_color: string;

  @IsString()
  @Matches(HEX_COLOR_PATTERN)
  secondary_color: string;

  @IsString()
  @Matches(HEX_COLOR_PATTERN)
  accent_color: string;

  @IsString()
  @Matches(HEX_COLOR_PATTERN)
  background_color: string;

  @IsString()
  @Matches(HEX_COLOR_PATTERN)
  text_color: string;
}

export class AccessibilityWarning {
  pair: string;
  ratio: number;
  required: number;
  suggestion: string;
}

export class ThemeOutput {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  mood: ThemeMood;
  confidence: number;
  palette: string[];
  source: 'brief' | 'image';
  contrast_ratio: number;
  contrast_passes_aa: boolean;
  accessibility_warnings: AccessibilityWarning[];
}

export class ExtractThemeResponse {
  generation_id: string;
  theme: ThemeOutput;
  duration_ms: number;
}

export class ValidateThemeResponse {
  valid: boolean;
  issues: AccessibilityWarning[];
}
