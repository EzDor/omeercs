import { IsOptional, IsString, IsIn, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import type { ThemeMood, GenerationType, GenerationStatus } from './intelligence-enums';
import { THEME_MOOD_VALUES, GENERATION_TYPE_VALUES, GENERATION_STATUS_VALUES } from './intelligence-enums';

export class ThemePresetTheme {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
}

export class ThemePresetItem {
  id: string;
  name: string;
  industry: string;
  mood: ThemeMood;
  theme: ThemePresetTheme;
}

export class ThemePresetsResponse {
  presets: ThemePresetItem[];
}

export class ThemePresetsQuery {
  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsIn(THEME_MOOD_VALUES)
  mood?: string;
}

export class GenerationHistoryQuery {
  @IsOptional()
  @IsUUID()
  campaign_id?: string;

  @IsOptional()
  @IsIn(GENERATION_TYPE_VALUES)
  type?: string;

  @IsOptional()
  @IsIn(GENERATION_STATUS_VALUES)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class GenerationHistoryItem {
  id: string;
  campaign_id: string | null;
  generation_type: GenerationType;
  status: GenerationStatus;
  accepted: boolean;
  input_params: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  duration_ms: number | null;
  llm_model: string | null;
  attempts: number;
  created_at: string;
}

export class GenerationHistoryResponse {
  generations: GenerationHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}
