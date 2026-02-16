import { IsString, IsOptional, IsUUID, IsArray, IsIn, IsInt, Min, Max, MaxLength, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { CopyType, CopyTone } from './intelligence-enums';
import { COPY_TYPE_VALUES, COPY_TONE_VALUES } from './intelligence-enums';

export class CampaignContextDto {
  @IsString()
  @IsIn(['spin_wheel', 'scratch_card', 'quiz', 'memory_match'])
  template_type: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  product_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  campaign_goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  target_audience?: string;
}

export class CopyConstraintsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  avoid_words?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  required_words?: string[];
}

export class GenerateCopyRequest {
  @IsOptional()
  @IsUUID()
  campaign_id?: string;

  @ValidateNested()
  @Type(() => CampaignContextDto)
  campaign_context: CampaignContextDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsIn(COPY_TYPE_VALUES, { each: true })
  copy_types: CopyType[];

  @IsIn(COPY_TONE_VALUES)
  tone: CopyTone;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  variations_count?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CopyConstraintsDto)
  constraints?: CopyConstraintsDto;
}

export class CopyVariation {
  text: string;
  character_count: number;
  tone_match_score: number;
  tone?: string;
  notes?: string;
}

export class CopyTypeResult {
  copy_type: CopyType;
  variations: CopyVariation[];
}

export class CopyComplianceWarning {
  copy_type: string;
  variation_index: number;
  term: string;
  category: 'misleading' | 'regulatory' | 'financial';
  severity: 'warning' | 'info';
  suggestion: string;
}

export class GenerateCopyResponse {
  generation_id: string;
  copies: CopyTypeResult[];
  compliance_warnings: CopyComplianceWarning[];
  duration_ms: number;
}

export class CopyDefaultsResponse {
  template_type: string;
  defaults: {
    cta_button: string[];
    win_message: string[];
    lose_message: string[];
  };
}
